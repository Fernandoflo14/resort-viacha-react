import { openDatabase } from '../shared/database.js';
import { api, body, HttpError, json } from '../shared/http.js';
import { tokens } from '../shared/token.js';
import { booking, formatReservation, rooms, roomFor } from './domain.js';
import { reservationRepository } from './repository.js';
import { reservationsSchema } from './schema.js';
import { spec } from './spec.js';

export function reservationsService({ path, secret }) {
  const jwt = tokens(secret);
  const db = openDatabase(path, reservationsSchema);
  const repository = reservationRepository(db);

  async function route(req, res, path) {
    const { method } = req;
    if (method === 'GET' && path === '/rooms') {
      json(res, 200, { success: true, rooms });
      return true;
    }
    if (method === 'GET' && path.startsWith('/availability/')) {
      const room = roomFor(path.slice('/availability/'.length));
      if (!room) throw new HttpError(404, 'Habitación no encontrada.');
      json(res, 200, { success: true, fullDates: repository.fullDates(room.id, room.stock) });
      return true;
    }
    if (method === 'GET' && path === '/reservations') {
      json(res, 200, { success: true, reservations: repository.list(jwt.owner(req)).map(formatReservation) });
      return true;
    }
    if (method === 'POST' && path === '/reservations') {
      const owner = jwt.owner(req);
      const data = booking(await body(req), req.headers['idempotency-key']);
      const result = repository.create(owner, data);
      if (result.past) throw new HttpError(400, 'Elige fechas a partir de hoy, según la hora de Bolivia.');
      if (result.unavailable) throw new HttpError(409, 'Las fechas ya no están disponibles. Elige otras.');
      if (result.different) throw new HttpError(409, 'Esa solicitud ya corresponde a otra reserva.');
      json(res, result.replay ? 200 : 201, { success: true, reservation: formatReservation(result.row) });
      return true;
    }
    if (method === 'DELETE' && /^\/reservations\/\d+$/.test(path)) {
      const owner = jwt.owner(req);
      const id = Number(path.split('/').pop());
      if (!Number.isSafeInteger(id) || !repository.cancel(id, owner)) throw new HttpError(404, 'Reserva no encontrada.');
      json(res, 200, { success: true, message: 'Reserva cancelada.' });
      return true;
    }
    return false;
  }
  return api({ db, route, spec, prefix: '/api/booking' });
}
