export const operationsSchema = `
  CREATE TABLE IF NOT EXISTS experience_bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL CHECK (user_id > 0),
    service TEXT NOT NULL,
    day TEXT NOT NULL,
    slot TEXT NOT NULL,
    guests INTEGER NOT NULL CHECK (guests BETWEEN 1 AND 6),
    total INTEGER NOT NULL CHECK (total > 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('qr', 'efectivo')),
    status TEXT NOT NULL DEFAULT 'confirmada' CHECK (status IN ('confirmada', 'cancelada')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    request_key TEXT,
    UNIQUE (user_id, request_key)
  );
  CREATE INDEX IF NOT EXISTS experience_capacity ON experience_bookings(service, day, slot, status);
  CREATE INDEX IF NOT EXISTS experience_owner ON experience_bookings(user_id, id);

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL CHECK (kind IN ('habitacion', 'experiencia')),
    booking_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    amount INTEGER NOT NULL CHECK (amount >= 0),
    method TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pendiente', 'cobrada', 'anulada', 'reembolso_pendiente', 'reembolsada', 'historica')),
    UNIQUE (kind, booking_id)
  );
  CREATE INDEX IF NOT EXISTS payments_owner ON payments(user_id, id);
  CREATE TABLE IF NOT EXISTS payment_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_id INTEGER NOT NULL REFERENCES payments(id),
    actor_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    reference TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX IF NOT EXISTS payment_reference ON payment_events(lower(reference)) WHERE reference IS NOT NULL;

  INSERT OR IGNORE INTO payments(kind, booking_id, user_id, amount, method, status)
    SELECT 'habitacion', id, user_id, total, payment_method, 'historica' FROM reservations;

  CREATE TRIGGER IF NOT EXISTS new_room_payment AFTER INSERT ON reservations BEGIN
    INSERT INTO payments(kind, booking_id, user_id, amount, method, status)
      VALUES ('habitacion', NEW.id, NEW.user_id, NEW.total, NEW.payment_method, 'pendiente');
    INSERT INTO payment_events(payment_id, actor_id, status) VALUES (last_insert_rowid(), NEW.user_id, 'pendiente');
  END;
  CREATE TRIGGER IF NOT EXISTS new_experience_payment AFTER INSERT ON experience_bookings BEGIN
    INSERT INTO payments(kind, booking_id, user_id, amount, method, status)
      VALUES ('experiencia', NEW.id, NEW.user_id, NEW.total, NEW.payment_method, 'pendiente');
    INSERT INTO payment_events(payment_id, actor_id, status) VALUES (last_insert_rowid(), NEW.user_id, 'pendiente');
  END;
`;

export function installOperations(db) {
  db.exec(operationsSchema);
  for (const [table, kind] of [['reservations', 'habitacion'], ['experience_bookings', 'experiencia']]) {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS cancel_${table} AFTER UPDATE OF status ON ${table}
      WHEN OLD.status = 'confirmada' AND NEW.status = 'cancelada' BEGIN
        INSERT INTO payment_events(payment_id, actor_id, status)
          SELECT id, NEW.user_id, CASE status WHEN 'cobrada' THEN 'reembolso_pendiente' ELSE 'anulada' END
          FROM payments WHERE kind = '${kind}' AND booking_id = NEW.id AND status IN ('pendiente','cobrada');
        UPDATE payments SET status = CASE status WHEN 'cobrada' THEN 'reembolso_pendiente' ELSE 'anulada' END
          WHERE kind = '${kind}' AND booking_id = NEW.id AND status IN ('pendiente','cobrada');
      END;
    `);
  }
}
