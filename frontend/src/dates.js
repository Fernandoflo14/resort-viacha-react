const bolivia = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit',
});
export const dayMs = 86_400_000;
export const dateOf = (value) => new Date(value + 'T00:00:00Z');
export const dateISO = (date) => date.toISOString().slice(0, 10);
export function today() {
  const pieces = Object.fromEntries(bolivia.formatToParts().map(({ type, value }) => [type, value]));
  return `${pieces.year}-${pieces.month}-${pieces.day}`;
}
export const plusDays = (date, days) => dateISO(new Date(dateOf(date).getTime() + dayMs * days));
const label = new Intl.DateTimeFormat('es-BO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const dateLabel = (value) => label.format(dateOf(value));
export const price = (value) => new Intl.NumberFormat('es-BO').format(value) + ' Bs';
