import React, { useEffect, useState } from 'react';
import { auth, booking, request } from './api.js';
import { dateLabel, price } from './dates.js';

export function AuthForm({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const register = mode === 'register';

  async function submit(event) {
    event.preventDefault();
    const { password } = Object.fromEntries(new FormData(event.currentTarget));
    setNotice('');
    setBusy(true);
    try {
      onAuth(await request(auth + '/' + mode, { method: 'POST', data: { email, password } }));
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="panel auth-panel">
    <div className="switches" aria-label="Acceso a la cuenta">
      <button type="button" aria-pressed={!register} disabled={busy} onClick={() => { setMode('login'); setNotice(''); }}>Ingresar</button>
      <button type="button" aria-pressed={register} disabled={busy} onClick={() => { setMode('register'); setNotice(''); }}>Crear cuenta</button>
    </div>
    <h2>{register ? 'Crea tu cuenta' : 'Inicia sesión'}</h2>
    <form onSubmit={submit} className="form-stack" key={mode}>
      <label>Correo electrónico<input name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></label>
      <label>Contraseña<input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 8 : undefined} maxLength={register ? 128 : 1024} /></label>
      {register && <small className="muted">Usa al menos 8 caracteres.</small>}
      {notice && <p className="notice error" role="alert">{notice}</p>}
      <button className="button" disabled={busy}>{busy ? 'Un momento…' : register ? 'Crear mi cuenta' : 'Ingresar'}</button>
    </form>
  </div>;
}

const avatars = [['logo.png', 'Logo'], ['piscina.jpg', 'Piscina'], ['bar.jpg', 'Bar'],
  ['viaje1.jpg', 'Charquini'], ['viaje2.jpg', 'Tiwanaku'], ['demo1.jpg', 'Resort']];

function Profile({ session }) {
  const { user, token, setUser, expire } = session;
  const [draft, setDraft] = useState(user);
  const [notice, setNotice] = useState(null);
  const [saving, setSaving] = useState(false);
  const changed = ['name', 'description', 'profileImage'].filter(field => draft[field] !== user[field]);
  const update = (key, value) => setDraft(current => ({ ...current, [key]: value }));

  async function upload(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 290_000) {
      setNotice({ error: true, text: 'Elige una imagen PNG, JPG o WebP de hasta 290 KB.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { update('profileImage', reader.result); setNotice(null); };
    reader.onerror = () => setNotice({ error: true, text: 'No se pudo leer la imagen.' });
    reader.readAsDataURL(file);
  }

  async function save(event) {
    event.preventDefault();
    setNotice(null);
    setSaving(true);
    try {
      const data = Object.fromEntries(changed.map(field => [field, draft[field]]));
      const result = await request(auth + '/profile', { method: 'PUT', token, data });
      setUser(result.user);
      setDraft(result.user);
      setNotice({ text: 'Tus cambios se guardaron.' });
    } catch (error) {
      expire(error);
      setNotice({ error: true, text: error.message });
    } finally {
      setSaving(false);
    }
  }

  return <section className="panel">
    <h2>Mi perfil</h2>
    <form className="form-stack" onSubmit={save}>
      <div className="profile-avatar"><img src={draft.profileImage} alt="Foto de perfil" /><div><strong>{user.name || 'Huésped'}</strong><p>{user.email}</p></div></div>
      <div className="avatar-options" aria-label="Imágenes del resort">
        {avatars.map(([file, label]) => <button key={file} type="button" aria-label={label} aria-pressed={draft.profileImage === '/assets/' + file}
          disabled={saving} onClick={() => update('profileImage', '/assets/' + file)}><img src={'/assets/' + file} alt="" /></button>)}
      </div>
      <label className="file-label">Subir una foto<input type="file" accept="image/png,image/jpeg,image/webp" onChange={upload} disabled={saving} /></label>
      <label>Nombre<input value={draft.name} maxLength={60} onChange={event => update('name', event.target.value)} disabled={saving} /></label>
      <label>Acerca de ti<textarea value={draft.description} rows="3" maxLength={300} onChange={event => update('description', event.target.value)} disabled={saving} /></label>
      {notice && <p className={notice.error ? 'notice error' : 'notice'} role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
      <button className="button" disabled={saving || !changed.length}>{saving ? 'Guardando…' : 'Guardar perfil'}</button>
    </form>
  </section>;
}

function ReservationList({ session }) {
  const { token, expire } = session;
  const [rows, setRows] = useState(null);
  const [notice, setNotice] = useState(null);
  const [revision, reload] = useState(0);
  const [pending, setPending] = useState(null);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    request(booking + '/reservations', { token, signal: controller.signal }).then(({ reservations }) => setRows(reservations)).catch(error => {
      if (error.name === 'AbortError') return;
      expire(error);
      setRows(null);
      setNotice({ error: true, text: error.message });
    });
    return () => controller.abort();
  }, [token, revision]);

  async function cancel(id) {
    setPending(id);
    setNotice(null);
    try {
      await request(booking + '/reservations/' + id, { method: 'DELETE', token });
      setRows(current => current.map(row => row.id === id ? { ...row, status: 'cancelada' } : row));
      setNotice({ text: 'La reserva se canceló.' });
      setConfirm(null);
    } catch (error) {
      expire(error);
      setNotice({ error: true, text: error.message });
    } finally {
      setPending(null);
    }
  }

  return <section className="panel">
    <h2>Mis reservas</h2>
    {notice && <p className={notice.error ? 'notice error' : 'notice'} role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
    {!rows && (notice ? <button className="button secondary" onClick={() => { setNotice(null); reload(revision + 1); }}>Reintentar</button> : <p role="status">Cargando reservas…</p>)}
    {rows?.length === 0 && <><p>Aún no tienes reservas.</p><a href="#/habitaciones" className="text-link">Explorar habitaciones ↗</a></>}
    {rows?.map(row => <article className="reservation" key={row.id}>
      <div className="reservation-top"><span>{row.code}</span><span className={'status ' + row.status}>{row.status}</span></div>
      <h3>{row.roomName}</h3>
      <p>{dateLabel(row.checkIn)} – {dateLabel(row.checkOut)}</p>
      <p>{row.guests} {row.guests === 1 ? 'huésped' : 'huéspedes'} · {price(row.total)} · {row.paymentMethod.toUpperCase()}</p>
      {row.status === 'confirmada' && (confirm === row.id ?
        <div className="actions"><button type="button" className="button danger" disabled={pending !== null} onClick={() => cancel(row.id)}>{pending === row.id ? 'Cancelando…' : 'Sí, cancelar'}</button>
          <button type="button" className="button secondary" disabled={pending !== null} onClick={() => setConfirm(null)}>Conservar reserva</button></div> :
        <button type="button" className="text-button" disabled={pending !== null} onClick={() => setConfirm(row.id)}>Cancelar reserva</button>)}
    </article>)}
  </section>;
}

export function Account({ session }) {
  const { user, token, checking, updateSession, sessionError, restoreSession } = session;
  return <section className="wrap page">
    <div className="page-heading with-action"><div><p className="overline">PARADISE RESORT</p><h1>Mi cuenta</h1>
      <p>Gestiona tu perfil y tus próximas estadías.</p></div>
      {user && <button type="button" className="button secondary" onClick={() => updateSession(null)}>Cerrar sesión</button>}</div>
    {sessionError && <p role="alert" className="notice error">{sessionError}</p>}
    {checking ? <p role="status">Verificando tu sesión…</p> : user ? <div className="account-grid" key={user.id}><Profile session={session} /><ReservationList session={session} /></div> :
      token ? <button type="button" className="button" onClick={() => restoreSession()}>Reintentar</button> : <AuthForm onAuth={updateSession} />}
  </section>;
}
