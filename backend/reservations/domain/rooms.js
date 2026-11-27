import { ApplicationError } from '../../shared/application-error.js';

export const rooms = [
  { id: 'estandar', name: 'Suite Estándar', price: 120, stock: 3, image: '/assets/cuarto1.jpg' },
  { id: 'deluxe', name: 'Suite Deluxe', price: 250, stock: 3, image: '/assets/cuarto2.jpg' },
  { id: 'familiar', name: 'Suite Familiar', price: 320, stock: 2, image: '/assets/cuarto2.jpg' },
  { id: 'terraza', name: 'Suite Terraza', price: 380, stock: 2, image: '/assets/cuarto3.jpg' },
  { id: 'presidencial', name: 'Suite Presidencial', price: 450, stock: 2, image: '/assets/cuarto3.jpg' },
];
export const paymentMethods = ['qr', 'tarjeta', 'efectivo'];
export const maxNights = 30;
export const maxGuests = 6;
const day = 86_400_000;
const bolivia = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit',
});

export const roomFor = (id) => rooms.find(room => room.id === id);
export const dateText = (time) => new Date(time).toISOString().slice(0, 10);

export function today() {
  const pieces = Object.fromEntries(bolivia.formatToParts().map(({ type, value }) => [type, value]));
  return `${pieces.year}-${pieces.month}-${pieces.day}`;
}

function time(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN;
  const result = Date.parse(date + 'T00:00:00Z');
  return Number.isFinite(result) && dateText(result) === date ? result : NaN;
}

export function* stayDates(start, end) {
  const limit = time(end);
  for (let date = time(start); date < limit; date += day) yield dateText(date);
}

export function booking(data, requestKey, resolve = roomFor) {
  const { room, checkIn, checkOut, guests, paymentMethod } = data;
  const category = resolve(room);
  if (!category || category.enabled === false) throw new ApplicationError(400, 'Selecciona una habitación válida.');
  if (!Number.isFinite(time(checkIn)) || !Number.isFinite(time(checkOut))) {
    throw new ApplicationError(400, 'Elige fechas válidas.');
  }
  const nights = (time(checkOut) - time(checkIn)) / day;
  if (nights < 1 || nights > maxNights) throw new ApplicationError(400, 'La estadía debe ser de 1 a 30 noches.');
  if (!Number.isInteger(guests) || guests < 1 || guests > maxGuests) throw new ApplicationError(400, 'Indica entre 1 y 6 huéspedes.');
  if (category.capacity && guests > category.capacity) throw new ApplicationError(400, 'La capacidad de esta suite no permite ese número de huéspedes.');
  if (!paymentMethods.includes(paymentMethod)) throw new ApplicationError(400, 'Selecciona un método de pago.');
  if (requestKey !== undefined && !/^[\w-]{8,100}$/.test(requestKey)) throw new ApplicationError(400, 'La clave de la solicitud no es válida.');
  return { room, checkIn, checkOut, guests, paymentMethod, nights, total: nights * category.price, stock: category.stock, requestKey };
}

export function formatReservation(row) {
  return {
    id: row.id, code: `PR-${String(row.id).padStart(5, '0')}`, room: row.room, roomName: roomFor(row.room)?.name ?? row.room,
    checkIn: row.check_in, checkOut: row.check_out, guests: row.guests, nights: row.nights, total: row.total,
    paymentMethod: row.payment_method, status: row.status, createdAt: row.created_at,
  };
}

