import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { auth, request } from './api.js';
import { Account } from './account.jsx';
import { Rooms, Calendar } from './booking.jsx';
import { Guide } from './guide.jsx';
import './styles.css';

const pages = { '/index.html': '', '/precios.html': 'habitaciones', '/calendario.html': 'calendario',
  '/guia_turistica.html': 'guia', '/usuario.html': 'cuenta', '/login.html': 'cuenta' };
const readRoute = () => location.hash.startsWith('#/') ? location.hash.slice(2) : pages[location.pathname] || '';
const sessionKey = 'resort-viacha-session';
const navigation = [['', 'Inicio'], ['habitaciones', 'Habitaciones'], ['guia', 'Guía local'], ['calendario', 'Calendario']];
const siteName = 'Paradise Resort · Viacha';

function Brand() {
  return <a className="brand" href="#/" aria-label="Paradise Resort, inicio">
    <img src="/assets/logo.png" alt="" width="44" height="44" />
    <span>PARADISE<small>RESORT · VIACHA</small></span>
  </a>;
}

function Home() {
  return <>
    <section className="hero">
      <div className="hero-inner wrap">
        <p className="overline">VIACHA <span>·</span> LA PAZ, BOLIVIA</p>
        <h1>Una pausa<br />en el <em>altiplano.</em></h1>
        <p>Descansa entre paisajes abiertos. Disfruta la piscina, el bar y una suite a tu medida en Paradise Resort.</p>
        <div className="actions">
          <a className="button button-light" href="#/habitaciones">Ver habitaciones <span aria-hidden="true">↗</span></a>
          <a className="button button-overlay" href="#/guia">Explorar la zona</a>
        </div>
      </div>
    </section>
    <div className="feature-strip"><div className="wrap feature-inner">
      <span>Suites para descansar</span><span>Piscina Infinity</span><span>Bar y coctelería</span><span>Excursiones en La Paz</span>
    </div></div>
    <section className="wrap home-section">
      <div className="section-heading">
        <div><p className="overline">EL RESORT</p><h2>Tiempo para disfrutar.</h2></div>
        <p>Empieza el día en la piscina, termina con un cóctel y vuelve a tu suite a descansar.</p>
      </div>
      <div className="cards">
        {[['piscina.jpg', 'Piscina Infinity', 'Un lugar para relajarte al aire libre.'],
          ['bar.jpg', 'Bar y coctelería', 'Una copa y buena compañía al final del día.'],
          ['cuarto2.jpg', 'Suites', 'Tres categorías para elegir tu estadía.']].map(([image, title, description]) =>
          <article className="card" key={title}><img src={'/assets/' + image} alt={title} loading="lazy" />
            <div className="card-body"><h3>{title}</h3><p>{description}</p></div></article>)}
      </div>
    </section>
    <section className="bottom-call">
      <div className="wrap"><h2>Tu próxima escapada empieza aquí.</h2>
        <a className="button button-light" href="#/habitaciones">Consultar tarifas <span aria-hidden="true">↗</span></a></div>
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
      setSessionError('Tu sesión expiró. Vuelve a iniciar sesión.');
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
    const label = navigation.find(([id]) => page === id)?.[1] || (page === 'cuenta' ? 'Mi cuenta' : '');
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
          onClick={() => setMenu(!menu)}>{menu ? 'Cerrar' : 'Menú'}</button>
        <nav id="navigation" className={menu ? 'nav is-open' : 'nav'} aria-label="Principal">
          {navigation.map(([id, label]) => <a key={id} href={'#/' + id} aria-current={isActive(id)}>{label}</a>)}
        </nav>
        <a href="#/cuenta" className="account-link" aria-current={isActive('cuenta')}>{user ? 'Mi perfil' : 'Mi cuenta'} <span aria-hidden="true">↗</span></a>
      </div>
    </header>
    <main id="contenido" tabIndex={-1}>
      {page === '' ? <Home /> : page === 'habitaciones' ? <Rooms session={session} start={params.get('entrada')} /> :
        page === 'calendario' ? <Calendar /> : page === 'guia' ? <Guide /> : page === 'cuenta' ? <Account session={session} /> :
          <section className="wrap page"><h1>Página no encontrada</h1><a className="text-link" href="#/">Volver al inicio</a></section>}
    </main>
    <footer className="footer"><div className="wrap footer-row"><Brand /><span>Viacha, La Paz · Bolivia</span>
      <a href="#/habitaciones">Habitaciones y reservas <span aria-hidden="true">↗</span></a></div></footer>
  </>;
}

createRoot(document.getElementById('root')).render(<App />);
