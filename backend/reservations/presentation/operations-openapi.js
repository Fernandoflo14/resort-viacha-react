import { array, integer, object, ok, operation, pathParam, string } from '../../shared/openapi.js';
import { experiences } from '../domain/experiences.js';

const date = string({ format: 'date' });
const experienceId = string({ enum: experiences.map(item => item.id) });
const id = pathParam('id', integer({ minimum: 1 }));
const day = { name: 'day', in: 'query', required: true, schema: date };
const range = ['from', 'to'].map(name => ({ name, in: 'query', schema: date }));
const forbidden = [403, 'Permisos insuficientes'];
const invalid = [400, 'Datos inválidos'];
const missing = [404, 'No encontrado'];
const statuses = string({ enum: ['pendiente','cobrada','anulada','reembolso_pendiente','reembolsada','historica'] });
const method = string({ enum: ['qr', 'efectivo'] });

const item = object({
  id: experienceId, name: string(), category: string(), description: string(), image: string(),
  price: integer(), capacity: integer(), slots: array(string()),
});
const input = object({ service: experienceId, day: date, slot: string({ example: '14:00' }), guests: integer({ minimum: 1, maximum: 6 }), method });
const reserved = object({
  id: integer(), user_id: integer(), code: string(), name: string(), service: experienceId, day: date,
  slot: string(), guests: integer(), total: integer(), payment_method: method,
  status: string({ enum: ['confirmada', 'cancelada'] }), created_at: string(),
});
const payment = object({
  id: integer(), kind: string({ enum: ['habitacion','experiencia'] }), booking_id: integer(), user_id: integer(),
  amount: integer(), method: string(), status: statuses,
});
const experienceResult = ok({ reservation: reserved });
const create = operation('Reservar un turno', {
  auth: true, input, output: experienceResult, status: 201,
  parameters: [{ name: 'Idempotency-Key', in: 'header', schema: string({ minLength: 8, maxLength: 100 }) }],
  errors: [invalid, [409, 'Cupo insuficiente o solicitud duplicada']],
});
create.responses[200] = { description: 'Solicitud ya guardada', content: { 'application/json': { schema: experienceResult } } };
const report = operation('Descargar historial en PDF (administración)', { auth: true, parameters: range, errors: [invalid, forbidden] });
report.responses[200] = { description: 'Informe PDF', content: { 'application/pdf': { schema: string({ format: 'binary' }) } } };

export const operationsPaths = {
  '/experiences': { get: operation('Consultar experiencias', { output: ok({ experiences: array(item) }) }) },
  '/experiences/{service}/slots': { get: operation('Consultar cupos por turno', {
    parameters: [pathParam('service', experienceId), day], output: ok({ slots: array(object({ time: string(), remaining: integer() })) }), errors: [invalid, missing],
  }) },
  '/experience-bookings': {
    get: operation('Consultar mis experiencias', { auth: true, output: ok({ reservations: array(reserved) }) }), post: create,
  },
  '/experience-bookings/{id}': { delete: operation('Cancelar mi experiencia', { auth: true, parameters: [id], errors: [missing, [409, 'La actividad ya comenzó']] }) },
  '/payments': { get: operation('Consultar mis pagos', { auth: true, output: ok({ payments: array(object({ ...payment.properties, code: string() })) }) }) },
  '/operations/history': { get: operation('Consultar historial (recepción y administración)', {
    auth: true, parameters: range, errors: [invalid, forbidden], output: ok({
      from: date, to: date,
      rows: array(object({ ...payment.properties, code: string(), day: date, item: string(), booking_status: string() })),
      summary: object(Object.fromEntries(['count','confirmed','cancelled','received','pending','refunded','pendingRefund'].map(name => [name, integer()]))),
    }),
  }) },
  '/operations/history.pdf': { get: report },
  '/operations/payments/{id}': {
    get: operation('Consultar movimientos de pago (personal)', {
      auth: true, parameters: [id], errors: [forbidden, missing],
      output: ok({ events: array(object({ id: integer(), actor_id: integer(), status: statuses, reference: string({ nullable: true }), created_at: string() })) }),
    }),
    post: operation('Registrar un cobro o una devolución ya verificados (personal)', {
      auth: true, parameters: [id], errors: [invalid, forbidden, missing, [409, 'El estado o el comprobante ya cambiaron']],
      input: object({ action: string({ enum: ['cobrar','reembolsar'] }), reference: string({ minLength: 3, maxLength: 60 }) }),
      output: ok({ payment }),
    }),
  },
};
