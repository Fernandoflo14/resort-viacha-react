import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openDatabase, transaction } from './shared/database.js';
import { authSchema } from './auth/schema.js';
import { reservationsSchema } from './reservations/schema.js';

export function migrate(sourcePath, authPath, bookingPath) {
  const [sourceFile, authFile, bookingFile] = [sourcePath, authPath, bookingPath].map((file) => resolve(file));
  if (new Set([sourceFile, authFile, bookingFile]).size !== 3) throw new Error('Usa tres archivos SQLite distintos.');

  const source = new DatabaseSync(sourceFile, { readOnly: true });
  try {
    const columns = new Set(source.prepare('PRAGMA table_info(users)').all().map(({ name }) => name));
    const name = columns.has('name') ? "COALESCE(name, '')" : "''";
    const description = columns.has('description') ? "COALESCE(description, '')" : "''";
    const image = columns.has('profile_image') ? "COALESCE(profile_image, '/assets/logo.png')" : "'/assets/logo.png'";
    const users = source.prepare(`SELECT id, email, password_hash, ${name} AS name, ${description} AS description,
      ${image} AS image, created_at FROM users ORDER BY id`).all();
    const hasReservations = source.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'reservations'").get();
    const reservations = hasReservations ? source.prepare('SELECT * FROM reservations ORDER BY id').all() : [];
    const ids = new Set(users.map(({ id }) => id));
    if (reservations.some(({ user_id }) => !ids.has(user_id))) throw new Error('El respaldo tiene reservas sin usuario asociado.');

    openDatabase(bookingFile, reservationsSchema).close();
    const target = openDatabase(authFile, authSchema);
    try {
      target.prepare('ATTACH DATABASE ? AS booking').run(bookingFile);
      return transaction(target, () => {
        if (target.prepare('SELECT 1 FROM users LIMIT 1').get() ||
            target.prepare('SELECT 1 FROM booking.reservations LIMIT 1').get()) {
          throw new Error('Las bases destino deben estar vacías. La migración se canceló.');
        }
        const addUser = target.prepare('INSERT INTO users (id, email, password_hash, name, description, profile_image, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
        for (const user of users) addUser.run(user.id, user.email, user.password_hash, user.name, user.description, user.image, user.created_at);
        const addBooking = target.prepare(`INSERT INTO booking.reservations
          (id, user_id, room, check_in, check_out, guests, nights, total, payment_method, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const row of reservations) {
          addBooking.run(row.id, row.user_id, row.room, row.check_in, row.check_out, row.guests, row.nights, row.total,
            row.payment_method, row.status, row.created_at);
        }
        return { usuarios: users.length, reservas: reservations.length };
      });
    } finally {
      target.close();
    }
  } finally {
    source.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.umask(0o077);
    if (!process.argv[2]) throw new Error('Indica la ruta de una copia de respaldo de resort.sqlite.');
    const result = migrate(process.argv[2], process.env.AUTH_DB || 'data/auth.sqlite', process.env.RESERVATIONS_DB || 'data/reservas.sqlite');
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
