import { array, document, integer, object, ok, operation, pathParam, ref, string } from '../shared/openapi.js';
import { maxGuests, maxNights, rooms, paymentMethods } from './domain.js';

const room = string({ enum: rooms.map(({ id }) => id) });
const date = string({ format: 'date' });
const input = object({
  room, checkIn: date, checkOut: date, guests: integer({ minimum: 1, maximum: maxGuests }),
  paymentMethod: string({ enum: paymentMethods, description: 'Modalidad simulada. No se procesa un cobro.' }),
});
const reservation = object({
  id: integer(), code: string(), roomName: string(), ...input.properties,
  nights: integer({ minimum: 1, maximum: maxNights }), total: integer({ description: 'Importe en bolivianos' }),
  status: string({ enum: ['confirmada', 'cancelada'] }), createdAt: string(),
});
const roomShape = object({ id: room, name: string(), price: integer(), stock: integer(), image: string() });
const result = ok({ reservation: ref('Reservation') });
const create = operation('Crear una reserva', {
  auth: true, input, output: result, status: 201,
  parameters: [{ name: 'Idempotency-Key', in: 'header', schema: string({ minLength: 8, maxLength: 100, pattern: '^[a-zA-Z0-9_-]+$' }) }],
  errors: [[400, 'Datos inválidos'], [409, 'Sin disponibilidad o clave duplicada con otros datos'], [413, 'Datos demasiado grandes'], [415, 'Se requiere JSON']],
});
create.responses[200] = { description: 'Reintento de una solicitud ya guardada', content: { 'application/json': { schema: result } } };
export const spec = document('Resort Viacha · Reservas', {
  '/rooms': { get: operation('Consultar habitaciones y tarifas', { output: ok({ rooms: array(ref('Room')) }) }) },
  '/availability/{room}': { get: operation('Consultar fechas sin cupo por habitación', {
    output: ok({ fullDates: array(date) }), parameters: [pathParam('room', room)], errors: [[404, 'Habitación no encontrada']],
  }) },
  '/reservations': {
    get: operation('Consultar mis reservas', { auth: true, output: ok({ reservations: array(ref('Reservation')) }) }),
    post: create,
  },
  '/reservations/{id}': { delete: operation('Cancelar mi reserva', {
    auth: true, parameters: [pathParam('id', integer({ minimum: 1 }))],
    output: ok({ message: string() }), errors: [[404, 'Reserva no encontrada']],
  }) },
}, { Room: roomShape, Reservation: reservation });
