import { openDatabase } from '../shared/database.js';
import { api, body, json } from '../shared/http.js';
import { tokens } from '../shared/token.js';
import { roomBookings } from './application/room-bookings.js';
import { reservationRepository } from './infrastructure/room-repository.js';
import { reservationsSchema } from './infrastructure/schema.js';
import { spec } from './presentation/spec.js';
import { operations } from './application/operations.js';
import { operationsRepository } from './infrastructure/operations-repository.js';
import { expandRooms } from './infrastructure/room-migration.js';
import { installOperations } from './infrastructure/operations-schema.js';
import { historyPdf } from './infrastructure/report-pdf.js';
import { operationsRoutes } from './presentation/operations-routes.js';
import { installPms } from './infrastructure/pms-schema.js';
import { pms } from './application/pms.js';
import { pmsRoutes } from './presentation/pms-routes.js';
import { resortCatalog } from './infrastructure/resort-catalog.js';

export function reservationsService({ path, secret }) {
  const jwt = tokens(secret);
  const db = openDatabase(path, reservationsSchema);
  expandRooms(db);
  installOperations(db);
  installPms(db);
  const catalog = resortCatalog(db);
  const pmsApi = pmsRoutes(pms(db), jwt);
  const service = roomBookings(reservationRepository(db),catalog);
  const extra = operationsRoutes(operations(operationsRepository(db),catalog), jwt, historyPdf);
  const paymentState = reservation => {
    const payment=db.prepare("SELECT status FROM payments WHERE kind='habitacion' AND booking_id=?").get(reservation.id);
    return {...reservation,roomName:catalog.room(reservation.room)?.name||reservation.roomName,bookingState:reservation.status==='cancelada'?'cancelada':payment?.status==='cobrada'?'confirmada':'pendiente_pago'};
  };

  async function route(req, res, path) {
    const { method } = req;
    // Unpaid holds release inventory after 48h, unless a receipt awaits review.
    for(const [table,kind] of [['reservations','habitacion'],['experience_bookings','experiencia']]){
      db.prepare(`UPDATE ${table} SET status='cancelada' WHERE status='confirmada'
        AND EXISTS(SELECT 1 FROM payments p WHERE p.kind=? AND p.booking_id=${table}.id AND p.status='pendiente'
        AND NOT EXISTS(SELECT 1 FROM pms_proofs q WHERE q.payment_id=p.id AND q.status='pendiente'))
        AND datetime(created_at)<datetime('now','-48 hours')`).run(kind);
    }
    if(path==='/pms/resort-catalog'&&method==='GET'){
      json(res,200,{success:true,data:catalog.manage(jwt.identity(req))});return true;
    }
    if(path==='/pms/resort-catalog'&&method==='PUT'){
      const input=await body(req);json(res,200,{success:true,data:catalog.save(jwt.identity(req),input.kind,input)});return true;
    }
    if (method === 'GET' && path === '/rooms') {
      json(res, 200, { success: true, rooms: service.catalog() });
      return true;
    }
    if (method === 'GET' && path.startsWith('/availability/')) {
      const id = path.slice('/availability/'.length);
      json(res, 200, { success: true, fullDates: service.fullDates(id) });
      return true;
    }
    if (method === 'GET' && path === '/reservations') {
      json(res, 200, { success: true, reservations: service.list(jwt.owner(req)).map(paymentState) });
      return true;
    }
    if (method === 'POST' && path === '/reservations') {
      const owner = jwt.owner(req);
      const result = service.create(owner, await body(req), req.headers['idempotency-key']);
      json(res, result.replay ? 200 : 201, { success: true, reservation: paymentState(result.reservation) });
      return true;
    }
    if (method === 'DELETE' && /^\/reservations\/\d+$/.test(path)) {
      const owner = jwt.owner(req);
      const id = Number(path.split('/').pop());
      if (db.prepare("SELECT id FROM pms_stays WHERE reservation_id=?").get(id)) {
        const { ApplicationError } = await import('../shared/application-error.js');
        throw new ApplicationError(409, 'La reserva ya tiene una estancia. Consulta a recepción.');
      }
      service.cancel(id, owner);
      json(res, 200, { success: true, message: 'Reserva cancelada.' });
      return true;
    }
    if (await pmsApi(req, res, path)) return true;
    return extra(req, res, path);
  }
  return api({ db, route, spec, prefix: '/api/booking' });
}

