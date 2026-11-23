import { transaction } from '../../shared/database.js';

export function operationsRepository(db) {
  const seats = db.prepare("SELECT COALESCE(SUM(guests),0) AS used FROM experience_bookings WHERE service=? AND day=? AND slot=? AND status='confirmada'");
  const replay = db.prepare('SELECT * FROM experience_bookings WHERE user_id=? AND request_key=?');
  const insert = db.prepare('INSERT INTO experience_bookings(user_id,service,day,slot,guests,total,payment_method,request_key) VALUES (?,?,?,?,?,?,?,?) RETURNING *');
  const payments = db.prepare('SELECT * FROM payments WHERE user_id=? ORDER BY id DESC');
  const payment = db.prepare('SELECT * FROM payments WHERE id=?');
  const event = db.prepare('INSERT INTO payment_events(payment_id,actor_id,status,reference) VALUES (?,?,?,?)');
  const update = db.prepare('UPDATE payments SET status=? WHERE id=? RETURNING *');
  const history = db.prepare(`
    SELECT p.*, COALESCE(r.room,e.service) AS item, COALESCE(r.check_in,e.day) AS day,
      COALESCE(r.status,e.status) AS booking_status
    FROM payments p
    LEFT JOIN reservations r ON p.kind='habitacion' AND p.booking_id=r.id
    LEFT JOIN experience_bookings e ON p.kind='experiencia' AND p.booking_id=e.id
    WHERE COALESCE(r.check_in,e.day) BETWEEN ? AND ?
    ORDER BY day DESC, p.id DESC
  `);
  const remaining = (service, day, slot) => service.capacity - seats.get(service.id, day, slot).used;
  return {
    remaining,
    create(owner, service, { day, slot, guests, method, key, open }) {
      return transaction(db, () => {
        const previous = key && replay.get(owner, key);
        if (previous) {
          const same = previous.service === service.id && previous.day === day && previous.slot === slot &&
            previous.guests === guests && previous.payment_method === method;
          return same ? { row: previous, replay: true } : { duplicate: true };
        }
        if (!open) return { past: true };
        if (remaining(service, day, slot) < guests) return { full: true };
        return { row: insert.get(owner, service.id, day, slot, guests, service.price * guests, method, key ?? null) };
      });
    },
    bookings: id => db.prepare('SELECT * FROM experience_bookings WHERE user_id=? ORDER BY id DESC').all(id),
    cancel: (owner, id, isOpen) => transaction(db, () => {
      const row = db.prepare('SELECT day, slot, status FROM experience_bookings WHERE user_id=? AND id=?').get(owner, id);
      if (!row) return 'missing';
      if (row.status === 'cancelada') return 'ok';
      if (!isOpen(row.day, row.slot)) return 'past';
      db.prepare("UPDATE experience_bookings SET status='cancelada' WHERE user_id=? AND id=?").run(owner, id);
      return 'ok';
    }),
    payments: id => payments.all(id),
    history: (from, to) => history.all(from, to),
    events: id => db.prepare('SELECT id,actor_id,status,reference,created_at FROM payment_events WHERE payment_id=? ORDER BY id').all(id),
    settle(id, actor, action, reference, transitions) {
      return transaction(db, () => {
        const current = payment.get(id);
        if (!current) return { missing: true };
        const status = transitions[current.status]?.[action];
        if (!status) return { conflict: true };
        try {
          event.run(id, actor, status, reference);
        } catch (error) {
          if (error.errcode === 2067) return { duplicate: true };
          throw error;
        }
        return { row: update.get(status, id) };
      });
    },
    hasPayment: id => Boolean(payment.get(id)),
  };
}
