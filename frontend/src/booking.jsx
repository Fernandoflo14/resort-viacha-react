import React, { useEffect, useRef, useState } from 'react';
import { booking, request } from './api.js';
import { dateISO, dateLabel, dateOf, dayMs, plusDays, price, today } from './dates.js';
import { AuthForm } from './account.jsx';

const roomCopy = {
  estandar: 'Una suite acogedora para una escapada al altiplano.',
  deluxe: 'Más espacio para descansar después de explorar Viacha.',
  familiar: 'Una opción para compartir la estadía en familia.',
  terraza: 'Una suite pensada para disfrutar del aire libre.',
  presidencial: 'La suite más amplia para una ocasión especial.',
};

function useQuery(endpoint, field, revision = 0) {
  const key = endpoint + ':' + revision;
  const [state, setState] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    request(endpoint, { signal: controller.signal }).then(result => {
      setState({ key, data: result[field] });
    }).catch(error => {
      if (error.name !== 'AbortError') setState({ key, error: error.message });
    });
    return () => controller.abort();
  }, [endpoint, field, revision]);
  return state?.key === key ? state : {};
}

function BookingForm({ room, start, session }) {
  const first = today();
  const initial = /^\d{4}-\d{2}-\d{2}$/.test(start || '') && start >= first && !Number.isNaN(dateOf(start).getTime()) && dateISO(dateOf(start)) === start ? start : first;
  const [draft, setDraft] = useState({ checkIn: initial, checkOut: plusDays(initial, 1), guests: '2', paymentMethod: 'qr' });
  const [notice, setNotice] = useState('');
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);
  const [revision, reload] = useState(0);
  const idempotency = useRef(null);
  const availability = useQuery(booking + '/availability/' + room.id, 'fullDates', revision);
  const nights = (dateOf(draft.checkOut) - dateOf(draft.checkIn)) / dayMs;
  const conflict = availability.data?.some(date => draft.checkIn <= date && date < draft.checkOut);

  function change(event) {
    const { name, value } = event.target;
    setDraft(current => ({
      ...current, [name]: value,
      ...(name === 'checkIn' && value && (current.checkOut <= value || current.checkOut > plusDays(value, 30)) ? { checkOut: plusDays(value, 1) } : {}),
    }));
    idempotency.current = null;
    setNotice('');
    setSaved(null);
  }

  async function book(event) {
    event.preventDefault();
    if (!session.user || conflict || busy || saved || !availability.data) return;
    setBusy(true);
    setNotice('');
    idempotency.current ??= Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
    try {
      const { reservation } = await request(booking + '/reservations', {
        method: 'POST', token: session.token, data: { ...draft, room: room.id, guests: Number(draft.guests) }, key: idempotency.current,
      });
      setSaved(reservation);
    } catch (error) {
      session.expire(error);
      setNotice(error.message);
      if (error.status === 409) reload(revision + 1);
    } finally {
      setBusy(false);
    }
  }

  return <div className="booking-layout">
    <form className="panel form-stack" onSubmit={book}>
      <h2>{room.name}</h2>
      <fieldset className="field-grid" disabled={busy || Boolean(saved)}>
        <label>Entrada<input type="date" name="checkIn" value={draft.checkIn} min={first} required onChange={change} /></label>
        <label>Salida<input type="date" name="checkOut" value={draft.checkOut} min={draft.checkIn ? plusDays(draft.checkIn, 1) : first}
          max={draft.checkIn ? plusDays(draft.checkIn, 30) : undefined} required onChange={change} /></label>
        <label>Huéspedes<select name="guests" value={draft.guests} onChange={change}>
          {[1, 2, 3, 4, 5, 6].map(count => <option key={count} value={count}>{count}</option>)}</select></label>
        <label>Forma de pago<select name="paymentMethod" value={draft.paymentMethod} onChange={change}>
          <option value="qr">QR en recepción</option><option value="tarjeta">Tarjeta en recepción</option><option value="efectivo">Efectivo en recepción</option></select></label>
      </fieldset>
      <p className="muted">Pagas en recepción. El personal registrará el cobro con tu comprobante.</p>
      {nights > 0 && <div className="total"><span>{nights} {nights === 1 ? 'noche' : 'noches'} × {price(room.price)}</span><strong>{price(nights * room.price)}</strong></div>}
      {availability.error ? <p className="notice error" role="alert">{availability.error} <button type="button" className="text-button" onClick={() => reload(revision + 1)}>Reintentar</button></p> :
        !availability.data ? <p role="status">Buscando disponibilidad…</p> :
          !saved && conflict ? <p className="notice error" role="alert">Hay una noche sin cupo. Prueba con otras fechas.</p> :
            !saved && <p className="muted">Disponibilidad consultada para esta habitación.</p>}
      {notice && <p className="notice error" role="alert">{notice}</p>}
      {saved ? <div className="notice" role="status">
        <strong>Reserva {saved.status} · {saved.code}</strong>
        <p>{dateLabel(saved.checkIn)} – {dateLabel(saved.checkOut)} · {price(saved.total)}</p>
        <a className="text-link" href="#/cuenta">Ir a mis reservas ↗</a>
        <button type="button" className="text-button new-booking" onClick={() => { setSaved(null); idempotency.current = null; reload(revision + 1); }}>Hacer otra reserva</button>
      </div> : session.user && <button className="button" disabled={busy || !availability.data || conflict || nights < 1}>
        {busy ? 'Confirmando…' : 'Confirmar reserva'}</button>}
    </form>
    {!session.user && <aside>
      <h3>Accede para confirmar tu reserva</h3>
      {session.sessionError && <p className="notice error" role="alert">{session.sessionError}</p>}
      {session.checking ? <p role="status">Verificando tu sesión…</p> :
        session.token ? <button className="button secondary" onClick={() => session.restoreSession()}>Reintentar</button> :
          <AuthForm onAuth={session.updateSession} />}
    </aside>}
  </div>;
}

export function Rooms({ session, start }) {
  const [selection, setSelection] = useState(null);
  const [revision, reload] = useState(0);
  const formHeading = useRef(null);
  const catalog = useQuery(booking + '/rooms', 'rooms', revision);
  const selected = catalog.data?.find(room => room.id === selection);
  function select(room) {
    setSelection(room);
    requestAnimationFrame(() => formHeading.current?.focus());
  }

  return <section className="wrap page">
    <div className="page-heading"><p className="overline">ESTADÍA EN VIACHA</p><h1>Habitaciones y reservas</h1>
      <p>Elige una suite y consulta la disponibilidad de tus fechas.</p></div>
    {catalog.error ? <p className="notice error" role="alert">{catalog.error} <button className="text-button" onClick={() => reload(revision + 1)}>Reintentar</button></p> :
      !catalog.data ? <p role="status">Cargando habitaciones…</p> : <div className="cards">
        {catalog.data.map(room => <article className={'card room-card' + (selection === room.id ? ' selected' : '')} key={room.id}>
          <img src={room.image} alt={['familiar', 'terraza'].includes(room.id) ? 'Imagen referencial de alojamiento' : room.name} />
          <div className="card-body"><h2>{room.name}</h2><p>{roomCopy[room.id]}</p>
            <div className="room-price"><strong>{price(room.price)}</strong><span> / noche</span></div>
            <button type="button" className="button secondary" onClick={() => select(room.id)} aria-pressed={selection === room.id}>Elegir habitación <span aria-hidden="true">↗</span></button>
          </div></article>)}
      </div>}
    {selected && <section className="booking-section">
      <h2 tabIndex={-1} ref={formHeading}>Completa tu reserva</h2>
      <BookingForm key={selected.id + ':' + start} room={selected} start={start} session={session} />
    </section>}
  </section>;
}

const monthLabel = new Intl.DateTimeFormat('es-BO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const firstOfMonth = (date) => date.slice(0, 7) + '-01';
function offsetMonth(month, amount) {
  const date = dateOf(month);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return dateISO(date);
}

export function Calendar() {
  const first = today();
  const [month, setMonth] = useState(() => firstOfMonth(first));
  const [selected, setSelected] = useState(first);
  const offset = (dateOf(month).getUTCDay() + 6) % 7;
  const count = (dateOf(offsetMonth(month, 1)) - dateOf(month)) / dayMs;
  const weekdays = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
  return <section className="wrap page">
    <div className="page-heading"><p className="overline">PLANIFICA TU VIAJE</p><h1>Calendario</h1>
      <p>Escoge una fecha de entrada y consulta el cupo al elegir tu suite.</p></div>
    <div className="calendar-layout">
      <section className="panel" aria-label="Calendario de fechas">
        <div className="calendar-head">
          <button className="icon-button" type="button" aria-label="Mes anterior" disabled={month <= firstOfMonth(first)} onClick={() => setMonth(offsetMonth(month, -1))}>‹</button>
          <h2 aria-live="polite">{monthLabel.format(dateOf(month))}</h2>
          <button className="icon-button" type="button" aria-label="Mes siguiente" onClick={() => setMonth(offsetMonth(month, 1))}>›</button>
        </div>
        <div className="calendar-grid">
          {weekdays.map(value => <span key={value} className="weekday">{value}</span>)}
          {Array.from({ length: offset }, (_, index) => <span key={'gap' + index} />)}
          {Array.from({ length: count }, (_, index) => {
            const date = plusDays(month, index);
            return <button key={date} type="button" disabled={date < first} aria-label={dateLabel(date)}
              aria-pressed={date === selected} aria-current={date === first ? 'date' : undefined}
              onClick={() => setSelected(date)}>{index + 1}</button>;
          })}
        </div>
      </section>
      <aside className="panel calendar-summary"><h2>Entrada seleccionada</h2><p>{dateLabel(selected)}</p>
        <a className="button" href={'#/habitaciones?entrada=' + selected}>Elegir habitación <span aria-hidden="true">↗</span></a></aside>
    </div>
  </section>;
}
