import { transaction } from '../../shared/database.js';
import { stayDates, today } from '../domain/rooms.js';

export function reservationRepository(db) {
  const open = db.prepare("SELECT check_in, check_out FROM reservations WHERE room = ? AND status = 'confirmada' AND check_out > ?");
  const intersect = db.prepare("SELECT check_in, check_out FROM reservations WHERE room = ? AND status = 'confirmada' AND check_out > ? AND check_in < ?");
  const byOwner = db.prepare('SELECT * FROM reservations WHERE user_id = ? ORDER BY id DESC');
  const byRequest = db.prepare('SELECT * FROM reservations WHERE user_id = ? AND request_key = ?');
  const insert = db.prepare(`INSERT INTO reservations (user_id, room, check_in, check_out, guests, nights, total, payment_method, request_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`);
  const cancel = db.prepare("UPDATE reservations SET status = 'cancelada' WHERE id = ? AND user_id = ? RETURNING id");
  const byId = db.prepare('SELECT check_in, status FROM reservations WHERE id=? AND user_id=?');

  function occupancy(rows, start, end) {
    const counts = new Map();
    for (const row of rows) {
      const from = row.check_in < start ? start : row.check_in;
      const until = end && row.check_out > end ? end : row.check_out;
      for (const date of stayDates(from, until)) counts.set(date, (counts.get(date) || 0) + 1);
    }
    return counts;
  }

  return {
    fullDates(room, stock) {
      const first = today();
      return [...occupancy(open.all(room, first), first)].filter(([, count]) => count >= stock).map(([date]) => date).sort();
    },
    list: (id) => byOwner.all(id),
    cancel: (id, owner) => transaction(db, () => {
      const row = byId.get(id, owner);
      if (!row) return 'missing';
      if (row.status === 'cancelada') return 'ok';
      if (row.check_in < today()) return 'past';
      cancel.get(id, owner);
      return 'ok';
    }),
    create(owner, data) {
      const { room, checkIn, checkOut, guests, nights, total, paymentMethod, stock, requestKey } = data;
      return transaction(db, () => {
        const existing = requestKey && byRequest.get(owner, requestKey);
        if (existing) {
          const same = existing.room === room && existing.check_in === checkIn && existing.check_out === checkOut &&
            existing.guests === guests && existing.payment_method === paymentMethod;
          return same ? { row: existing, replay: true } : { different: true };
        }
        if (checkIn < today()) return { past: true };
        const counts = occupancy(intersect.all(room, checkIn, checkOut), checkIn, checkOut);
        for (const date of stayDates(checkIn, checkOut)) {
          if ((counts.get(date) || 0) >= stock) return { unavailable: true };
        }
        return { row: insert.get(owner, room, checkIn, checkOut, guests, nights, total, paymentMethod, requestKey ?? null) };
      });
    },
  };
}
