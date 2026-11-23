import { categoryFor, experiences, nextPayment } from '../domain/experiences.js';
import { roomFor, today } from '../domain/rooms.js';
import { ApplicationError } from '../../shared/application-error.js';

const fail = (status, message) => { throw new ApplicationError(status, message); };

function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(400, 'Indica una fecha válida.');
  const parsed = new Date(value + 'T00:00:00Z');
  if (Number.isNaN(+parsed) || parsed.toISOString().slice(0, 10) !== value) fail(400, 'Indica una fecha válida.');
  return value;
}

export const bookingCode = (kind, id) => (kind === 'habitacion' ? 'PR-' : 'EX-') + String(id).padStart(5, '0');
const mapExperience = row => ({ ...row, code: bookingCode('experiencia', row.id), name: categoryFor(row.service)?.name ?? row.service });

function forDate(day) {
  const [d, t] = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/La_Paz', dateStyle: 'short', timeStyle: 'short',
  }).format(new Date()).split(' ');
  if (day < d) return () => false;
  return (slot) => day > d || slot > t;
}

export function operations(repository) {
  return {
    catalog: () => experiences,
    slots(id, day) {
      const service = categoryFor(id);
      if (!service) fail(404, 'Experiencia no encontrada.');
      date(day);
      const open = forDate(day);
      return service.slots.map(time => ({ time, remaining: open(time) ? repository.remaining(service, day, time) : 0 }));
    },
    create(owner, input, key) {
      const service = categoryFor(input.service);
      if (!service) fail(400, 'Selecciona una experiencia válida.');
      const day = date(input.day);
      const { slot, guests, method } = input;
      if (!service.slots.includes(slot) || !Number.isInteger(guests) || guests < 1 || guests > 6) fail(400, 'Elige un horario y entre 1 y 6 personas.');
      if (!['qr', 'efectivo'].includes(method)) fail(400, 'Elige una forma de pago.');
      if (key !== undefined && !/^[\w-]{8,100}$/.test(key)) fail(400, 'Clave de solicitud inválida.');
      const result = repository.create(owner, service, { day, slot, guests, method, key, open: forDate(day)(slot) });
      if (result.past) fail(400, 'El horario seleccionado ya pasó.');
      if (result.duplicate) fail(409, 'La solicitud ya corresponde a otra reserva.');
      if (result.full) fail(409, 'Ya no hay cupo para ese turno. Elige otro horario.');
      return { reservation: mapExperience(result.row), replay: Boolean(result.replay) };
    },
    bookings: id => repository.bookings(id).map(mapExperience),
    cancel(owner, id) {
      if (!Number.isSafeInteger(id) || id <= 0) fail(404, 'Reserva no encontrada.');
      const result = repository.cancel(owner, id, (day, time) => forDate(day)(time));
      if (result === 'missing') fail(404, 'Reserva no encontrada.');
      if (result === 'past') fail(409, 'La actividad ya comenzó. Consulta a recepción.');
    },
    payments: id => repository.payments(id).map(p => ({ ...p, code: bookingCode(p.kind, p.booking_id) })),
    history(from, to) {
      from = date(from ?? today().slice(0, 7) + '-01');
      to = date(to ?? today());
      if (from > to || Date.parse(to) - Date.parse(from) > 366 * 86400000) fail(400, 'Elige un rango de hasta 367 días.');
      const rows = repository.history(from, to).map(p => ({
        ...p,
        code: bookingCode(p.kind, p.booking_id),
        item: (p.kind === 'habitacion' ? roomFor(p.item) : categoryFor(p.item))?.name ?? p.item,
      }));
      const summary = { count: rows.length, confirmed: 0, cancelled: 0, received: 0, pending: 0, refunded: 0, pendingRefund: 0 };
      for (const row of rows) {
        summary[row.booking_status === 'confirmada' ? 'confirmed' : 'cancelled']++;
        if (['cobrada', 'reembolsada', 'reembolso_pendiente'].includes(row.status)) summary.received += row.amount;
        if (row.status === 'pendiente') summary.pending += row.amount;
        if (row.status === 'reembolsada') summary.refunded += row.amount;
        if (row.status === 'reembolso_pendiente') summary.pendingRefund += row.amount;
      }
      return { from, to, rows, summary };
    },
    settle(id, actor, { action, reference }) {
      if (!['cobrar', 'reembolsar'].includes(action) || typeof reference !== 'string' ||
          !/^[\p{L}\p{N} ./_-]{3,60}$/u.test(reference.trim())) fail(400, 'Indica una referencia de comprobante de 3 a 60 caracteres.');
      const result = repository.settle(id, actor, action, reference.trim(), nextPayment);
      if (result.missing) fail(404, 'Transacción no encontrada.');
      if (result.duplicate) fail(409, 'Esa referencia ya fue registrada.');
      if (result.conflict) fail(409, 'La operación ya se registró o el estado cambió.');
      return result.row;
    },
    events(id) {
      if (!repository.hasPayment(id)) fail(404, 'Transacción no encontrada.');
      return repository.events(id);
    },
  };
}
