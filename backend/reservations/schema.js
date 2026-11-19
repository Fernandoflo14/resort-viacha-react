export const reservationsSchema = `
  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL CHECK (user_id > 0),
    room TEXT NOT NULL CHECK (room IN ('estandar', 'deluxe', 'presidencial')),
    check_in TEXT NOT NULL,
    check_out TEXT NOT NULL CHECK (check_out > check_in),
    guests INTEGER NOT NULL CHECK (guests BETWEEN 1 AND 6),
    nights INTEGER NOT NULL CHECK (nights BETWEEN 1 AND 30),
    total INTEGER NOT NULL CHECK (total >= 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('tarjeta', 'qr', 'efectivo')),
    status TEXT NOT NULL DEFAULT 'confirmada' CHECK (status IN ('confirmada', 'cancelada')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    request_key TEXT,
    UNIQUE (user_id, request_key)
  );
  CREATE INDEX IF NOT EXISTS reservations_owner ON reservations(user_id, id);
  CREATE INDEX IF NOT EXISTS reservations_stock ON reservations(room, status, check_out, check_in);
`;
