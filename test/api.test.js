import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { authService } from '../backend/auth/app.js';
import { reservationsService } from '../backend/reservations/app.js';
import { today, dateText } from '../backend/reservations/domain/rooms.js';
import { migrate } from '../backend/migrate.js';
import { hashPassword } from '../backend/auth/infrastructure/passwords.js';
import { frontendServer } from '../frontend/server.js';

const secret = 'secret-used-only-in-the-test-suite-2026';
const date = offset => dateText(Date.parse(today() + 'T00:00:00Z') + offset * 86_400_000);

function call(server, url, { method = 'GET', data, token, key, contentType = 'application/json', raw } = {}) {
  return new Promise((resolve, reject) => {
    const req = Readable.from(data || raw ? [Buffer.from(raw ?? JSON.stringify(data))] : []);
    req.url = url;
    req.method = method;
    req.headers = {
      ...(data || raw ? { 'content-type': contentType } : {}),
      ...(token ? { authorization: 'Bearer ' + token } : {}),
      ...(key ? { 'idempotency-key': key } : {}),
    };
    const response = {
      headers: {}, setHeader(name, value) { this.headers[name] = value; },
      writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); return this; },
      end(result) {
        let data = result;
        try { data = JSON.parse(result); } catch {}
        resolve({ status: this.status, data, headers: this.headers });
      },
      destroy: reject,
    };
    server.emit('request', req, response);
  });
}

function setup(t) {
  const directory = mkdtempSync(join(tmpdir(), 'resort-viacha-'));
  const paths = { auth: join(directory, 'auth.sqlite'), booking: join(directory, 'booking.sqlite') };
  const services = new Set();
  function open(roles = {}) {
    const auth = authService({ path: paths.auth, secret, ...roles });
    const booking = reservationsService({ path: paths.booking, secret });
    services.add(auth).add(booking);
    return { auth, booking };
  }
  function close(service) {
    service.emit('close');
    services.delete(service);
  }
  t.after(() => {
    for (const service of services) close(service);
    rmSync(directory, { recursive: true, force: true });
  });
  return { directory, paths, open, close };
}

const makeCredentials = email => ({ email, password: 'testing123' });
const register = (auth, email) => call(auth, '/api/auth/register', { method: 'POST', data: makeCredentials(email) });
const standard = () => ({ room: 'estandar', checkIn: date(2), checkOut: date(4), guests: 2, paymentMethod: 'efectivo' });
const book = (server, data, token, key) => call(server, '/api/booking/reservations', { method: 'POST', data, token, key });

test('registro concurrente, validación, autenticación y persistencia de perfil', async t => {
  const { open, close } = setup(t);
  const first = open();
  const registering = await Promise.all(Array.from({ length: 4 }, () => register(first.auth, ' Invitado@ejemplo.com ')));
  assert.deepEqual(registering.map(r => r.status).sort(), [201, 409, 409, 409]);
  const { user, token } = registering.find(r => r.status === 201).data;
  assert.equal(user.email, 'invitado@ejemplo.com');
  assert.equal(user.passwordHash, undefined);
  assert.equal((await call(first.auth, '/api/auth/profile', { token: token + 'a' })).status, 401);
  assert.equal((await call(first.auth, '/api/auth/login', { method: 'POST', data: { email: user.email, password: 'incorrecta' } })).status, 401);
  assert.equal((await call(first.auth, '/api/auth/register', { method: 'POST', raw: '{' })).status, 400);
  assert.equal((await call(first.auth, '/api/auth/register', { method: 'POST', contentType: 'text/plain', data: {} })).status, 415);
  assert.equal((await call(first.auth, '/api/auth/profile', { method: 'PUT', token, data: { profileImage: 'https://example.com' } })).status, 400);
  assert.equal((await call(first.auth, '/api/auth/profile', { method: 'PUT', token, data: { description: 'X'.repeat(460000) } })).status, 413);
  const profileImage = 'data:image/png;base64,' + readFileSync(new URL('../frontend/public/assets/logo.png', import.meta.url)).toString('base64');
  const saved = await call(first.auth, '/api/auth/profile', { method: 'PUT', token, data: { name: ' Ana ', profileImage } });
  assert.equal(saved.data.user.name, 'Ana');
  await call(first.auth, '/api/auth/profile', { method: 'PUT', token, data: { description: 'Me gusta Viacha.' } });
  close(first.auth); close(first.booking);
  const second = open();
  const login = await call(second.auth, '/api/auth/login', { method: 'POST', data: makeCredentials(user.email) });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.name, 'Ana');
  assert.equal(login.data.user.description, 'Me gusta Viacha.');
  assert.equal(login.data.user.profileImage, profileImage);
});

test('reservas simultáneas, reintentos, cancelación y aislamiento de usuarios', async t => {
  const { open, close } = setup(t);
  const first = open();
  const [{ data: alice }, { data: bob }] = await Promise.all([register(first.auth, 'ana@ejemplo.com'), register(first.auth, 'bob@ejemplo.com')]);
  const data = standard();
  assert.equal((await book(first.booking, data)).status, 401);
  assert.equal((await book(first.booking, { ...data, checkIn: date(-1) }, alice.token)).status, 400);
  assert.equal((await book(first.booking, { ...data, room: '__proto__' }, alice.token)).status, 400);
  assert.equal((await call(first.booking, '/api/booking/availability/__proto__')).status, 404);
  const requests = await Promise.all(Array.from({ length: 4 }, (_, index) => book(first.booking, data, alice.token, 'request-00' + index)));
  assert.deepEqual(requests.map(r => r.status).sort(), [201, 201, 201, 409]);
  const index = requests.findIndex(r => r.status === 201);
  const id = requests[index].data.reservation.id;
  const retry = await book(first.booking, data, alice.token, 'request-00' + index);
  assert.equal(retry.status, 200);
  assert.equal(retry.data.reservation.id, id);
  assert.equal(retry.data.reservation.total, 240);
  assert.equal((await book(first.booking, { ...data, guests: 4 }, alice.token, 'request-00' + index)).status, 409);
  const available = await call(first.booking, '/api/booking/availability/estandar');
  assert.deepEqual(available.data.fullDates, [date(2), date(3)]);
  const url = '/api/booking/reservations/' + id;
  assert.equal((await call(first.booking, url, { method: 'DELETE', token: bob.token })).status, 404);
  assert.deepEqual((await call(first.booking, '/api/booking/reservations', { token: bob.token })).data.reservations, []);
  assert.equal((await call(first.booking, url, { method: 'DELETE', token: alice.token })).status, 200);
  assert.deepEqual((await call(first.booking, '/api/booking/availability/estandar')).data.fullDates, []);
  close(first.auth); close(first.booking);
  const second = open();
  const after = await call(second.booking, '/api/booking/reservations', { token: alice.token });
  assert.equal(after.data.reservations.length, 3);
  assert.equal(after.data.reservations.find(row => row.id === id).status, 'cancelada');
});

test('migración conserva IDs, hash, perfil y reservas existentes', async t => {
  const { directory, paths, open } = setup(t);
  const legacyPath = join(directory, 'resort.sqlite');
  const legacy = new DatabaseSync(legacyPath);
  legacy.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, password_hash TEXT, profile_image TEXT, name TEXT, description TEXT, created_at TEXT);
    CREATE TABLE reservations (id INTEGER PRIMARY KEY, user_id INTEGER, room TEXT, check_in TEXT, check_out TEXT, guests INTEGER, nights INTEGER, total INTEGER, payment_method TEXT, status TEXT, created_at TEXT);
  `);
  const oldHash = await hashPassword('legacy-password');
  legacy.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?)').run(37, 'anterior@ejemplo.com', oldHash, '/assets/logo.png', 'Anterior', 'Perfil anterior', '2025-01-01');
  legacy.prepare('INSERT INTO reservations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(41, 37, 'estandar', date(2), date(3), 2, 1, 120, 'qr', 'confirmada', '2025-01-01');
  legacy.close();
  assert.deepEqual(migrate(legacyPath, paths.auth, paths.booking), { usuarios: 1, reservas: 1 });
  assert.throws(() => migrate(legacyPath, paths.auth, paths.booking), /vacías/);
  const { auth, booking } = open();
  const login = await call(auth, '/login', { method: 'POST', data: { email: 'anterior@ejemplo.com', password: 'legacy-password' } });
  assert.equal(login.data.user.id, 37);
  assert.equal(login.data.user.description, 'Perfil anterior');
  const result = await call(booking, '/reservations', { token: login.data.token });
  assert.equal(result.data.reservations[0].id, 41);
  const next = await register(auth, 'nueva@ejemplo.com');
  assert.equal(next.data.user.id, 38);
});

test('una cuenta con hash bcrypt del proyecto anterior puede volver a iniciar sesión', async t => {
  let bcrypt;
  try {
    bcrypt = (await import('bcryptjs')).default;
  } catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    return t.skip('Instala bcryptjs con npm install para probar las cuentas antiguas.');
  }
  const { paths, open, close } = setup(t);
  const initial = open();
  close(initial.auth);
  const db = new DatabaseSync(paths.auth);
  const digest = await bcrypt.hash('legacy-password', 4);
  db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run('cuentaviacha@gmail.com', digest);
  db.close();
  const { auth } = open();
  const { status, data } = await call(auth, '/login', { method: 'POST', data: {
    email: 'Cuenta.Viacha+antiguo@googlemail.com', password: 'legacy-password',
  } });
  assert.equal(status, 200);
  assert.equal(data.user.email, 'cuentaviacha@gmail.com');
});

test('los dos documentos OpenAPI publican las rutas y el esquema bearer', async t => {
  const { open } = setup(t);
  const { auth, booking } = open();
  for (const [server, prefix, privatePath, method] of [
    [auth, '/api/auth', '/profile', 'get'], [booking, '/api/booking', '/reservations', 'post'],
  ]) {
    const spec = await call(server, prefix + '/openapi.json');
    assert.equal(spec.status, 200);
    assert.equal(spec.data.openapi, '3.0.3');
    assert.deepEqual(spec.data.servers, [{ url: prefix }]);
    assert.deepEqual(spec.data.paths[privatePath][method].security, [{ bearerAuth: [] }]);
    const docs = await call(server, prefix + '/api-docs');
    assert.equal(docs.status, 200);
    assert.ok(docs.data.includes(prefix + '/openapi.json'));
  }
});

test('el frontend devuelve el HTML de React en inicio y entradas antiguas', async t => {
  const { directory } = setup(t);
  writeFileSync(join(directory, 'index.html'), '<div id="root"></div>');
  const frontend = frontendServer({ staticDir: directory });
  for (const path of ['/', '/precios.html', '/usuario.html']) {
    assert.equal((await call(frontend, path, { method: 'HEAD' })).status, 200);
  }
  assert.equal((await call(frontend, '/imagen-inexistente.jpg', { method: 'HEAD' })).status, 404);
  assert.equal((await call(frontend, '/api/desconocida')).status, 404);
  assert.equal((await call(frontend, '/api-docs')).headers.Location, '/api/auth/api-docs');
});


test('la comprobación pública falla si faltan los servicios de backend', async () => {
  const frontend = frontendServer({ auth: 'http://127.0.0.1:1', reservations: 'http://127.0.0.1:1' });
  const health = await call(frontend, '/health');
  assert.equal(health.status, 503);
  assert.deepEqual(health.data, { status: 'unavailable' });
});

test('experiencias, control de cupo, roles, cobro, cancelación y reembolso', async t => {
  const { open, close } = setup(t);
  let first = open();
  const base = '/api/booking';
  const signIn = email => call(first.auth, '/api/auth/login', { method: 'POST', data: makeCredentials(email) });
  const registerAs = async email => {
    const result = await call(first.auth, '/api/auth/register', {
      method: 'POST', data: { ...makeCredentials(email), role: 'admin' },
    });
    assert.equal(result.data.user.role, 'guest');
    return result.data;
  };
  await registerAs('admin@example.test');
  await registerAs('staff@example.test');
  const guest = await registerAs('guest@example.test');
  close(first.auth);
  close(first.booking);
  first = open({ adminIds: '1', staffIds: '2' });
  const admin = (await signIn('admin@example.test')).data;
  const staff = (await signIn('staff@example.test')).data;
  assert.equal(admin.user.role, 'admin');
  assert.equal(staff.user.role, 'staff');
  assert.equal((await call(first.auth, '/api/auth/profile', { token: admin.token })).data.user.role, 'admin');

  const history = base + '/operations/history?from=' + date(0) + '&to=' + date(10);
  const pdf = history.replace('history?', 'history.pdf?');
  assert.equal((await call(first.booking, history, { token: guest.token })).status, 403);
  assert.equal((await call(first.booking, pdf, { token: staff.token })).status, 403);
  assert.equal((await call(first.booking, base + '/operations/history')).status, 401);
  assert.equal((await call(first.booking, base + '/operations/history', { token: admin.token })).status, 200);
  const available = base + '/experiences/cocteleria/slots?day=' + date(3);
  assert.equal((await call(first.booking, available)).data.slots[0].remaining, 10);
  const input = { service: 'cocteleria', day: date(3), slot: '17:00', guests: 6, method: 'qr', amount: 1 };
  const create = (key, data = input) => call(first.booking, base + '/experience-bookings', { method: 'POST', token: guest.token, data, key });
  const attempts = await Promise.all([create('attempt-1'), create('attempt-2')]);
  assert.deepEqual(attempts.map(result => result.status).sort(), [201, 409]);
  const index = attempts.findIndex(result => result.status === 201);
  const { reservation } = attempts[index].data;
  assert.equal(reservation.total, 510);
  assert.equal((await create('attempt-' + (index + 1))).status, 200);
  assert.equal((await create('attempt-' + (index + 1), { ...input, guests: 3 })).status, 409);
  assert.equal((await create('attempt-past', { ...input, day: date(-1) })).status, 400);
  assert.equal((await call(first.booking, available)).data.slots[0].remaining, 4);
  const room = await book(first.booking, { ...standard(), room: 'familiar' }, guest.token);
  assert.equal(room.status, 201);
  const payments = (await call(first.booking, base + '/payments', { token: guest.token })).data.payments;
  assert.equal(payments.length, 2);
  assert.deepEqual((await call(first.booking, base + '/payments', { token: staff.token })).data.payments, []);
  const personPayment = payments.find(row => row.code === reservation.code);
  const roomPayment = payments.find(row => row.kind === 'habitacion');
  const settle = (id, token, action, reference) => call(first.booking, base + '/operations/payments/' + id, {
    method: 'POST', token, data: { action, reference },
  });
  assert.equal((await settle(personPayment.id, guest.token, 'cobrar', 'REC-701')).status, 403);
  assert.equal((await settle(personPayment.id, staff.token, 'cobrar', 'REC-701')).data.payment.status, 'cobrada');
  assert.equal((await settle(roomPayment.id, staff.token, 'cobrar', 'rec-701')).status, 409);
  const cancel = token => call(first.booking, base + '/experience-bookings/' + reservation.id, { method: 'DELETE', token });
  assert.equal((await cancel(staff.token)).status, 404);
  assert.equal((await cancel(guest.token)).status, 200);
  assert.equal((await cancel(guest.token)).status, 200);
  assert.equal((await call(first.booking, available)).data.slots[0].remaining, 10);
  const pending = await call(first.booking, history, { token: staff.token });
  assert.equal(pending.data.summary.pendingRefund, 510);
  assert.equal((await settle(personPayment.id, admin.token, 'reembolsar', 'DEV-701')).data.payment.status, 'reembolsada');
  const events = await call(first.booking, base + '/operations/payments/' + personPayment.id, { token: admin.token });
  assert.deepEqual(events.data.events.map(entry => entry.status), ['pendiente', 'cobrada', 'reembolso_pendiente', 'reembolsada']);
  assert.deepEqual(events.data.events.map(entry => entry.actor_id), [3, 2, 3, 1]);
  const exportResult = await call(first.booking, pdf, { token: admin.token });
  assert.equal(exportResult.headers['Content-Type'], 'application/pdf');
  assert.ok(exportResult.data.subarray(0, 8).equals(Buffer.from('%PDF-1.4')));
  close(first.auth);
  close(first.booking);
  const second = open({ adminIds: '1', staffIds: '2' });
  const restarted = await call(second.booking, history, { token: admin.token });
  assert.equal(restarted.data.summary.refunded, 510);
  assert.equal(restarted.data.summary.received, 510);
  assert.equal(restarted.data.summary.count, 2);
});

test('actualiza una base de reservas v2 conservando historial e idempotencia', async t => {
  const { paths, open, close } = setup(t);
  const db = new DatabaseSync(paths.booking);
  db.exec(`
    CREATE TABLE reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, room TEXT NOT NULL CHECK (room IN ('estandar','deluxe','presidencial')),
      check_in TEXT NOT NULL, check_out TEXT NOT NULL, guests INTEGER NOT NULL, nights INTEGER NOT NULL, total INTEGER NOT NULL,
      payment_method TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'confirmada', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, request_key TEXT
    );
  `);
  db.prepare('INSERT INTO reservations (id,user_id,room,check_in,check_out,guests,nights,total,payment_method,request_key) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(17, 1, 'estandar', date(2), date(4), 2, 2, 240, 'efectivo', 'migration-key');
  db.exec("UPDATE sqlite_sequence SET seq=40 WHERE name='reservations'");
  db.close();
  const first = open();
  const guest = (await register(first.auth, 'previous@example.test')).data;
  assert.equal((await book(first.booking, standard(), guest.token, 'migration-key')).data.reservation.id, 17);
  const newer = await book(first.booking, { ...standard(), room: 'terraza' }, guest.token, 'new-room-key');
  assert.equal(newer.data.reservation.id, 41);
  close(first.auth);
  close(first.booking);
  const second = open();
  const result = await call(second.booking, '/api/booking/payments', { token: guest.token });
  assert.deepEqual(result.data.payments.map(row => row.status), ['pendiente', 'historica']);
});

