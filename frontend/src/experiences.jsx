import React, { useEffect, useRef, useState } from 'react';
import { AuthForm } from './account.jsx';
import { booking, request } from './api.js';
import { dateLabel, price, today } from './dates.js';

export function useResource(path, token, version = 0) {
  const [state, setState] = useState(null);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    request(path, { token, signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setState({ path, token, version, data });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ path, token, version, error });
    });
    return () => controller.abort();
  }, [path, token, version]);
  return state?.path === path && state.token === token && state.version === version ? state : {};
}

export const paymentNames = {
  pendiente: 'Por pagar', cobrada: 'Pagado', anulada: 'Anulado', historica: 'Sin cobro verificado',
  reembolso_pendiente: 'Reembolso pendiente', reembolsada: 'Reembolsado',
};

function ExperienceForm({ item, session }) {
  const [day, setDay] = useState(today);
  const [slot, setSlot] = useState('');
  const [guests, setGuests] = useState(1);
  const [method, setMethod] = useState('efectivo');
  const [version, refresh] = useState(0);
  const [notice, setNotice] = useState('');
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);
  const requestKey = useRef(null);
  const pending = useRef(false);
  const slots = useResource(day && booking + '/experiences/' + item.id + '/slots?day=' + day, undefined, version);
  const remaining = slots.data?.slots.find(entry => entry.time === slot)?.remaining ?? 0;

  function change(set, value) {
    set(value);
    requestKey.current = null;
    setNotice('');
  }

  async function submit(event) {
    event.preventDefault();
    if (!session.user || pending.current || saved || guests > remaining) return;
    pending.current = true;
    setBusy(true);
    setNotice('');
    requestKey.current ??= Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('');
    try {
      const result = await request(booking + '/experience-bookings', {
        method: 'POST', token: session.token, key: requestKey.current, data: { service: item.id, day, slot, guests, method },
      });
      setSaved(result.reservation);
    } catch (error) {
      session.expire(error);
      setNotice(error.message);
      if (error.status === 409) refresh(current => current + 1);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  if (saved) return <div className="panel notice" role="status"><h3>Reserva {saved.status}</h3>
    <p>{saved.code} · {dateLabel(saved.day)} a las {saved.slot} · {price(saved.total)}</p>
    <a className="button" href="#/cuenta">Ir a mis reservas</a>
  </div>;
  return <div className="booking-layout">
    <form onSubmit={submit} className="panel form-stack">
      <h2>{item.name}</h2>
      <fieldset className="field-grid" disabled={busy}>
        <label>Fecha<input type="date" min={today()} value={day} required onChange={event => { setSlot(''); change(setDay, event.target.value); }} /></label>
        <label>Turno<select required value={slot} onChange={event => change(setSlot, event.target.value)}>
          <option value="">Elige un horario</option>
          {slots.data?.slots.map(({ time, remaining }) => <option key={time} value={time} disabled={remaining < guests}>{time} · {remaining} lugares</option>)}
        </select></label>
        <label>Personas<select value={guests} onChange={event => change(setGuests, Number(event.target.value))}>
          {[1, 2, 3, 4, 5, 6].map(n => <option key={n}>{n}</option>)}
        </select></label>
        <label>Pago en recepción<select value={method} onChange={event => change(setMethod, event.target.value)}>
          <option value="efectivo">Efectivo</option><option value="qr">QR</option>
        </select></label>
      </fieldset>
      {slots.error ? <p role="alert" className="notice error">{slots.error.message} <button type="button" className="text-button" onClick={() => refresh(version + 1)}>Reintentar</button></p> :
        day && !slots.data ? <p role="status">Consultando horarios…</p> :
        slots.data?.slots.every(entry => entry.remaining < guests) && <p className="notice">Elige otra fecha o reduce el número de personas.</p>}
      <div className="total"><span>{guests} × {price(item.price)}</span><strong>{price(item.price * guests)}</strong></div>
      {notice && <p className="notice error" role="alert">{notice}</p>}
      <p className="muted">Paga en recepción y consulta el estado del cobro en Mi cuenta.</p>
      {session.user && <button className="button" disabled={busy || !slot || remaining < guests}>{busy ? 'Reservando…' : 'Confirmar experiencia'}</button>}
    </form>
    {!session.user && <aside>
      {session.checking ? <p role="status">Verificando tu sesión…</p> :
        session.token ? <><p>{session.sessionError}</p><button className="button secondary" onClick={() => session.restoreSession()}>Reintentar</button></> :
          <AuthForm onAuth={session.updateSession} />}
    </aside>}
  </div>;
}

export function Experiences({ session }) {
  const [category, setCategory] = useState('Todas');
  const [selected, select] = useState(null);
  const [version, retry] = useState(0);
  const heading = useRef(null);
  const result = useResource(booking + '/experiences', undefined, version);
  const items = result.data?.experiences || [];
  return <section className="wrap page">
    <div className="page-heading"><p className="overline">GASTRONOMÍA · BIENESTAR · EXCURSIONES</p>
      <h1>Experiencias</h1><p>Reserva actividades por fecha y horario, con o sin alojamiento.</p></div>
    {result.error ? <p className="notice error" role="alert">{result.error.message} <button className="text-button" onClick={() => retry(version + 1)}>Reintentar</button></p> :
      !result.data ? <p role="status">Consultando experiencias…</p> : <>
      <div className="filter-row" aria-label="Categorías de experiencias">
        {['Todas', ...new Set(items.map(item => item.category))].map(value =>
          <button className="chip" key={value} aria-pressed={category === value} onClick={() => { setCategory(value); select(null); }}>{value}</button>)}
      </div>
      <div className="cards">{items.filter(item => category === 'Todas' || item.category === category).map(item =>
        <article className="card" key={item.id}><img src={item.image} alt="" loading="lazy" />
          <div className="card-body"><p className="item-category">{item.category}</p><h2>{item.name}</h2><p>{item.description}</p>
            <p className="room-price"><strong>{price(item.price)}</strong> / persona</p>
            <button className="button secondary" onClick={() => { select(item); requestAnimationFrame(() => heading.current?.focus()); }}>Ver horarios <span aria-hidden="true">↗</span></button>
          </div>
        </article>)}</div>
    </>}
    {selected && <section className="booking-section"><h2 ref={heading} tabIndex={-1}>Reserva tu experiencia</h2>
      <ExperienceForm key={selected.id} item={selected} session={session} /></section>}
  </section>;
}

export function MyExperiences({ session, roomVersion }) {
  const [version, refresh] = useState(0);
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const reservations = useResource(booking + '/experience-bookings', session.token, version);
  const payments = useResource(booking + '/payments', session.token, version + roomVersion);
  const error = reservations.error || payments.error;
  useEffect(() => { if (error) session.expire(error); }, [error]);

  async function cancel(id) {
    setPending(id);
    setNotice('');
    try {
      await request(booking + '/experience-bookings/' + id, { method: 'DELETE', token: session.token });
      setNotice('Experiencia cancelada. El estado de pago se actualizó.');
      setConfirm(null);
      refresh(current => current + 1);
    } catch (error) {
      session.expire(error);
      setNotice(error.message);
    } finally {
      setPending(null);
    }
  }

  return <>
    <section className="panel"><h2>Mis experiencias</h2>
      {notice && <p role="status" className="notice">{notice}</p>}
      {reservations.error ? <p role="alert">{reservations.error.message} <button className="text-button" onClick={() => refresh(version + 1)}>Reintentar</button></p> :
        !reservations.data ? <p role="status">Consultando experiencias…</p> :
          !reservations.data.reservations.length ? <a className="text-link" href="#/experiencias">Explorar experiencias ↗</a> :
            reservations.data.reservations.map(row => <article className="reservation" key={row.id}>
              <div className="reservation-top"><span>{row.code}</span><span className={'status ' + row.status}>{row.status}</span></div>
              <h3>{row.name}</h3><p>{dateLabel(row.day)} a las {row.slot} · {row.guests} {row.guests === 1 ? 'persona' : 'personas'}</p>
              {row.status === 'confirmada' && (confirm === row.id ? <div className="actions">
                <button className="button danger" disabled={pending !== null} onClick={() => cancel(row.id)}>Sí, cancelar</button>
                <button className="button secondary" disabled={pending !== null} onClick={() => setConfirm(null)}>Conservar</button>
              </div> : <button className="text-button" disabled={pending !== null} onClick={() => setConfirm(row.id)}>Cancelar experiencia</button>)}
            </article>)}
    </section>
    <section className="panel"><h2>Mis pagos</h2>
      {payments.error ? <p role="alert">{payments.error.message} <button className="text-button" onClick={() => refresh(version + 1)}>Reintentar</button></p> :
        !payments.data ? <p role="status">Consultando pagos…</p> :
          !payments.data.payments.length ? <p>Aún no tienes operaciones.</p> :
            payments.data.payments.map(row => <div className="payment-line" key={row.id}><span>{row.code}<small>{paymentNames[row.status]}</small></span><strong>{price(row.amount)}</strong></div>)}
    </section>
  </>;
}
