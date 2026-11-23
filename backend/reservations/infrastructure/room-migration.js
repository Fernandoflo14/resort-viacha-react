import { transaction } from '../../shared/database.js';
import { reservationsSchema } from './schema.js';

export function expandRooms(db) {
  const { sql } = db.prepare("SELECT sql FROM sqlite_schema WHERE name='reservations'").get();
  if (!/CHECK\s*\(room\s+IN/i.test(sql)) return;
  transaction(db, () => {
    const maximum = db.prepare("SELECT seq FROM sqlite_sequence WHERE name='reservations'").get()?.seq;
    db.exec(`
      DROP INDEX IF EXISTS reservations_owner;
      DROP INDEX IF EXISTS reservations_stock;
      ALTER TABLE reservations RENAME TO reservations_v2;
      ${reservationsSchema}
      INSERT INTO reservations (id,user_id,room,check_in,check_out,guests,nights,total,payment_method,status,created_at,request_key)
        SELECT id,user_id,room,check_in,check_out,guests,nights,total,payment_method,status,created_at,request_key FROM reservations_v2;
      DROP TABLE reservations_v2;
    `);
    if (maximum !== undefined) {
      db.prepare("INSERT INTO sqlite_sequence(name,seq) SELECT 'reservations',? WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name='reservations')").run(maximum);
      db.prepare("UPDATE sqlite_sequence SET seq=MAX(seq,?) WHERE name='reservations'").run(maximum);
    }
  });
}
