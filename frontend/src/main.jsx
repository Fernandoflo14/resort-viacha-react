import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { auth, request } from './api.js';
import { Account } from './account.jsx';
import { Rooms, Calendar } from './booking.jsx';
import { Guide } from './guide.jsx';
import { Experiences, MyExperiences } from './experiences.jsx';
import { Operations } from './operations.jsx';
import { PMS } from './pms.jsx';
import './styles.css';

const pages = { '/index.html': '', '/precios.html': 'habitaciones', '/calendario.html': 'calendario',
  '/guia_turistica.html': 'guia', '/usuario.html': 'cuenta', '/login.html': 'cuenta' };
const readRoute = () => location.hash.startsWith('#/') ? location.hash.slice(2) : pages[location.pathname] || '';
const sessionKey = 'resort-viacha-session';
const navigation = [['', 'Inicio'], ['habitaciones', 'Alojamiento'], ['experiencias', 'Experiencias'], ['guia', 'Gu�a local'], ['calendario', 'Calendario']];
const siteName = 'Paradise Resort � Viacha';

function Brand() {
  return <a className="brand" href="#/" aria-label="Paradise Resort, inicio">
    <img src="/assets/logo.png" alt="" width="44" height="44" />
    <span>PARADISE<small>RESORT � VIACHA</small></span>
  </a>;
}

function Home() {
  return <>
    <section className="hero">
      <div className="hero-inner wrap">
        <p className="overline">VIACHA <span>�</span> LA PAZ, BOLIVIA</p>
        <h1>Una pausa<br />en el <em>altiplano.</em></h1>
        <p>Descansa entre paisajes abiertos. Disfruta la piscina, el bar y una suite a tu medida en Paradise Resort.</p>
        <div className="actions">
          <a className="button button-light" href="#/habitaciones">Ver habitaciones <span aria-hidden="true">?</span></a>
          <a className="button button-overlay" href="#/experiencias">Ver experiencias</a>
        </div>
      </div>
    </section>
    <section className="wrap home-section">
      <div className="section-heading">
        <div><p className="overline">EL RESORT</p><h2>Elige c�mo pasar el d�a.</h2></div>
        <p>Reserva una suite para quedarte o elige una actividad para venir por el d�a.</p>
      </div>
      <div className="cards">
        {[['cuarto2.jpg', 'Alojamiento', 'Elige una suite y consulta tus fechas.', 'habitaciones', 'Ver suites'],
          ['piscina.jpg', 'Experiencias', 'Piscina, gastronom�a y salidas en grupo.', 'experiencias', 'Ver actividades'],
          ['viaje2.jpg', 'Gu�a local', 'Consulta rutas y planea tu recorrido por La Paz.', 'guia', 'Explorar rutas']].map(([image, title, description, page, label]) =>
          <article className="card" key={title}><img src={'/assets/' + image} alt="" loading="lazy" />
            <div className="card-body"><h3>{title}</h3><p>{description}</p><a className="text-link" href={'#/' + page}>{label} ?</a></div></article>)}
      </div>
    </section>
    <section className="bottom-call">
      <div className="wrap"><h2>Tu pr�xima escapada empieza aqu�.</h2>
        <a className="button button-light" href="#/habitaciones">Consultar tarifas <span aria-hidden="true">?</span></a></div>
    </section>
  </>;
}

function App() {
  const [route, setRoute] = useState(readRoute);
  const [token, setToken] = useState(() => sessionStorage.getItem(sessionKey) || '');
  const [user, setUser] = useState(null);
  const [sessionError, setSessionError] = useState('');
  const [menu, setMenu] = useState(false);
  const [page, query = ''] = route.split('?');
  const params = new URLSearchParams(query);
  const [checking, setChecking] = useState(Boolean(token));

  useEffect(() => {
    function onRoute() {
      setRoute(readRoute());
      setMenu(false);
      window.scrollTo(0, 0);
    }
    window.addEventListener('hashchange', onRoute);
    return () => window.removeEventListener('hashchange', onRoute);
  }, []);

  function updateSession(session) {
    if (!session) sessionStorage.removeItem(sessionKey);
    else sessionStorage.setItem(sessionKey, session.token);
    setToken(session?.token || '');
    setUser(session?.user || null);
    setSessionError('');
    setChecking(false);
  }

  function expire(error) {
    if (error.status === 401) {
      updateSession(null);
      setSessionError('Tu sesi�n expir�. Vuelve a iniciar sesi�n.');
    }
  }

  function restoreSession(signal) {
    setChecking(true);
    setSessionError('');
    request(auth + '/profile', { token, signal }).then(({ user: profile }) => {
      if (signal?.aborted) return;
      setUser(profile);
      setChecking(false);
    }).catch(error => {
      if (signal?.aborted || error.name === 'AbortError') return;
      expire(error);
      if (error.status !== 401) setSessionError(error.message);
      setChecking(false);
    });
  }

  useEffect(() => {
    if (!token || user) return;
    const controller = new AbortController();
    restoreSession(controller.signal);
    return () => controller.abort();
  }, [token]);

  useEffect(() => {
    const label = navigation.find(([id]) => page === id)?.[1] || ({ cuenta: 'Mi cuenta', operaciones: 'Operaciones' }[page] || '');
    document.title = label && page ? label + ' | ' + siteName : siteName;
  }, [page]);

  const session = { user, token, checking, updateSession, setUser, expire, sessionError, restoreSession };
  const isActive = (id) => page === id ? 'page' : undefined;
  return <>
    <a className="skip" href="#contenido" onClick={event => { event.preventDefault(); document.querySelector('main').focus(); }}>Ir al contenido</a>
    <header className="site-header">
      <div className="wrap header-row">
        <Brand />
        <button className="menu-toggle" type="button" aria-expanded={menu} aria-controls="navigation"
          onClick={() => setMenu(!menu)}>{menu ? 'Cerrar' : 'Men�'}</button>
        <nav id="navigation" className={menu ? 'nav is-open' : 'nav'} aria-label="Principal">
          {navigation.map(([id, label]) => <a key={id} href={'#/' + id} aria-current={isActive(id)}>{label}</a>)}
        </nav>
        <a href="#/cuenta" className="account-link" aria-current={isActive('cuenta')}>Mi cuenta <span aria-hidden="true">?</span></a>
      </div>
    </header>
    <main id="contenido" tabIndex={-1} key={page} className="page-enter">
      {page === '' ? <Home /> : page === 'habitaciones' ? <Rooms session={session} start={params.get('entrada')} /> :
        page === 'calendario' ? <Calendar /> : page === 'guia' ? <Guide /> :
          page === 'experiencias' ? <Experiences session={session} /> :
          page === 'cuenta' ? <Account session={session} extras={MyExperiences} /> :
          page === 'operaciones' ? <Operations session={session} /> :
          page === 'gestion' ? <PMS session={session} /> :
          <section className="wrap page"><h1>P�gina no encontrada</h1><a className="text-link" href="#/">Volver al inicio</a></section>}
    </main>
    <footer className="footer"><div className="wrap footer-row"><Brand /><span>Viacha, La Paz � Bolivia</span>
      <a href="#/habitaciones">Habitaciones y reservas <span aria-hidden="true">?</span></a></div></footer>
  </>;
}

createRoot(document.getElementById('root')).render(<App />);

