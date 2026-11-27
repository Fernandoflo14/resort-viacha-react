import { rooms } from '../domain/rooms.js';
import { transaction } from '../../shared/database.js';

export function installPms(db) {
  transaction(db, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS pms_rooms(
        id INTEGER PRIMARY KEY, number TEXT NOT NULL UNIQUE, category TEXT NOT NULL,
        condition TEXT NOT NULL DEFAULT 'lista' CHECK(condition IN ('lista','limpieza','mantenimiento'))
      );
      CREATE TABLE IF NOT EXISTS pms_stays(
        id INTEGER PRIMARY KEY, reservation_id INTEGER NOT NULL UNIQUE REFERENCES reservations(id),
        room_id INTEGER NOT NULL REFERENCES pms_rooms(id), status TEXT NOT NULL CHECK(status IN ('alojado','finalizado')),
        check_in_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, check_out_at TEXT, actor_id INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS pms_active_room ON pms_stays(room_id) WHERE status='alojado';
      CREATE TABLE IF NOT EXISTS pms_catalog(
        id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, category TEXT NOT NULL,
        price_cents INTEGER NOT NULL CHECK(price_cents>0), enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN(0,1))
      );
      CREATE TABLE IF NOT EXISTS pms_charges(
        id INTEGER PRIMARY KEY, stay_id INTEGER NOT NULL REFERENCES pms_stays(id),
        product_id INTEGER NOT NULL REFERENCES pms_catalog(id), description TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK(quantity>0), amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
        actor_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS pms_settlements(
        id INTEGER PRIMARY KEY, stay_id INTEGER NOT NULL REFERENCES pms_stays(id),
        amount_cents INTEGER NOT NULL CHECK(amount_cents>0), method TEXT NOT NULL CHECK(method IN('efectivo','qr','tarjeta')),
        reference TEXT NOT NULL COLLATE NOCASE UNIQUE, actor_id INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS pms_proofs(
        id INTEGER PRIMARY KEY, payment_id INTEGER NOT NULL REFERENCES payments(id),
        user_id INTEGER NOT NULL, reference TEXT NOT NULL COLLATE NOCASE UNIQUE,
        status TEXT NOT NULL DEFAULT 'pendiente' CHECK(status IN('pendiente','aceptado','rechazado')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewed_by INTEGER, reviewed_at TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS pms_one_proof ON pms_proofs(payment_id) WHERE status='pendiente';
      CREATE TABLE IF NOT EXISTS pms_tasks(
        id INTEGER PRIMARY KEY, room_id INTEGER NOT NULL REFERENCES pms_rooms(id),
        kind TEXT NOT NULL CHECK(kind IN('limpieza','mantenimiento')), description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pendiente' CHECK(status IN('pendiente','en_proceso','finalizada')),
        actor_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS pms_audit(
        id INTEGER PRIMARY KEY, actor_id INTEGER NOT NULL, action TEXT NOT NULL, object_id INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS pms_payment_settings(
        id INTEGER PRIMARY KEY CHECK(id=1), beneficiary TEXT NOT NULL DEFAULT '',
        instructions TEXT NOT NULL DEFAULT '', qr_image TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS pms_stay_proofs(
        id INTEGER PRIMARY KEY, stay_id INTEGER NOT NULL REFERENCES pms_stays(id), user_id INTEGER NOT NULL,
        amount_cents INTEGER NOT NULL CHECK(amount_cents>0), reference TEXT NOT NULL COLLATE NOCASE UNIQUE,
        status TEXT NOT NULL DEFAULT 'pendiente' CHECK(status IN('pendiente','aceptado','rechazado')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewed_by INTEGER
      );
      CREATE UNIQUE INDEX IF NOT EXISTS pms_stay_proof_pending ON pms_stay_proofs(stay_id) WHERE status='pendiente';
      INSERT OR IGNORE INTO pms_payment_settings(id) VALUES(1);
    `);
    const seed = db.prepare('INSERT OR IGNORE INTO pms_rooms(number,category) VALUES(?,?)');
    for (const [index, category] of rooms.entries()) for(let n=1;n<=category.stock;n++) seed.run(String((index+1)*100+n),category.id);
    const product = db.prepare('INSERT OR IGNORE INTO pms_catalog(name,category,price_cents) VALUES(?,?,?)');
    for (const item of [['Masaje relajante','Spa',18000],['Pase de piscina','Bienestar',6500],['Desayuno','Restaurante',4500],['Cena','Restaurante',11000],['Traslado local','Transporte',8000]]) product.run(...item);
  });
}
