import { ApplicationError } from '../../shared/application-error.js';
import { booking, formatReservation, rooms, roomFor } from '../domain/rooms.js';

export function roomBookings(repository, catalog = {rooms:()=>rooms,room:roomFor}) {
  return {
    catalog: () => catalog.rooms(),
    fullDates(id) {
      const room = catalog.room(id);
      if (!room) throw new ApplicationError(404, 'Habitación no encontrada.');
      return repository.fullDates(room.id, room.stock);
    },
    list: owner => repository.list(owner).map(formatReservation),
    create(owner, input, key) {
      const result = repository.create(owner, booking(input, key, catalog.room));
      if (result.past) throw new ApplicationError(400, 'Elige fechas a partir de hoy, según la hora de Bolivia.');
      if (result.unavailable) throw new ApplicationError(409, 'Las fechas ya no están disponibles. Elige otras.');
      if (result.different) throw new ApplicationError(409, 'Esa solicitud ya corresponde a otra reserva.');
      return { reservation: formatReservation(result.row), replay: Boolean(result.replay) };
    },
    cancel(id, owner) {
      if (!Number.isSafeInteger(id) || id <= 0) throw new ApplicationError(404, 'Reserva no encontrada.');
      const result = repository.cancel(id, owner);
      if (result === 'missing') throw new ApplicationError(404, 'Reserva no encontrada.');
      if (result === 'past') throw new ApplicationError(409, 'La estadía ya comenzó. Consulta a recepción.');
    },
  };
}

