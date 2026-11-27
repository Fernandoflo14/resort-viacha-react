import React,{useState} from 'react';
import {today,plusDays} from './dates.js';

export function LuxuryHome(){
  const [arrival,setArrival]=useState(today());
  const [departure,setDeparture]=useState(plusDays(today(),2));
  const [guests,setGuests]=useState('2');
  return <>
    <section className="lux-hero">
      <div className="wrap lux-hero-grid">
        <div className="lux-intro">
          <span className="lux-eyebrow"><span className="lux-stars">★★★★★</span> · CONCEPTO DE RESORT DE LUJO</span>
          <h1>Descubre otra forma<br/>de <em>escaparte.</em></h1>
          <p>Entre montañas, cultura y tranquilidad. Vive el altiplano boliviano con el confort de una estancia diseñada para ti.</p>
          <div className="lux-hero-links"><a href="#/experiencias">Descubrir experiencias →</a><a href="#/guia">Explorar el destino →</a></div>
        </div>
        <form className="lux-planner" onSubmit={e=>{e.preventDefault();location.hash='/habitaciones?entrada='+arrival+'&salida='+departure+'&personas='+guests}}>
          <p className="lux-eyebrow">RESERVA DIRECTA</p><h2>Tu próxima estancia</h2><p>Elige tus fechas y encuentra el alojamiento ideal.</p>
          <label>Entrada<input type="date" required min={today()} value={arrival} onChange={e=>{if(!e.target.value)return;setArrival(e.target.value);if(departure<=e.target.value||departure>plusDays(e.target.value,30))setDeparture(plusDays(e.target.value,1))}}/></label>
          <label>Salida<input type="date" required min={plusDays(arrival,1)} max={plusDays(arrival,30)} value={departure} onChange={e=>setDeparture(e.target.value)}/></label>
          <label>Huéspedes<select value={guests} onChange={e=>setGuests(e.target.value)}>{[1,2,3,4,5,6].map(n=><option key={n}>{n}</option>)}</select></label>
          <button className="button lux-gold">Buscar habitaciones →</button>
          <small>La reserva se confirma al verificar el pago del alojamiento.</small>
        </form>
      </div>
    </section>
    <section className="lux-reassurance"><div className="wrap lux-reassurance-grid">{[['01','Descanso','Suites para cada ocasión'],['02','Bienestar','Piscina y tratamientos'],['03','Gastronomía','Sabores para compartir'],['04','Exploración','Excursiones y cultura local']].map(([n,title,description])=><article key={n}><span>{n}</span><div><strong>{title}</strong><small>{description}</small></div></article>)}</div></section>
    <section className="wrap lux-section">
      <div className="lux-section-title"><div><p className="lux-eyebrow">DESCANSO & DESCUBRIMIENTO</p><h2>Diseña tu experiencia.</h2></div><p>Desde una escapada de fin de semana hasta unas vacaciones en familia. Elige lo que más disfrutas.</p></div>
      <div className="lux-gallery">
        {[['cuarto2.jpg','01 / ALOJAMIENTO','Suites & estancias','Un espacio para descansar y desconectar.','habitaciones'],['piscina.jpg','02 / BIENESTAR','Piscina & spa','Momentos de relajación a tu ritmo.','experiencias'],['bar1.jpg','03 / GASTRONOMÍA','Restaurante & bar','Encuentros alrededor de la mesa.','experiencias'],['viaje2.jpg','04 / DESTINO','Aventura & cultura','Descubre la riqueza del altiplano.','guia']].map(([image,kicker,title,description,link])=><a className="lux-tile" key={kicker} href={'#/'+link}><img src={'/assets/'+image} alt="" loading="lazy"/><div><span>{kicker}</span><h3>{title}</h3><p>{description}</p><b>Explorar →</b></div></a>)}
      </div>
    </section>
    <section className="lux-feature"><div className="wrap lux-feature-grid"><div><p className="lux-eyebrow">PARADISE, TU REFUGIO EN BOLIVIA</p><h2>Un viaje que va más allá de la habitación.</h2><p>Organiza tus días, reserva actividades y consulta tus consumos desde tu cuenta. Nuestro concepto reúne alojamiento, bienestar y aventura en un solo lugar.</p><a className="button lux-gold" href="#/experiencias">Ver actividades y tarifas →</a></div><img src="/assets/viaje1.jpg" alt="Paisaje de montaña del altiplano" loading="lazy"/></div></section>
    <section className="wrap lux-section lux-how"><p className="lux-eyebrow">TU VISITA, PASO A PASO</p><h2>Viaja con tranquilidad.</h2><div className="lux-step-grid">{[['1','Elige','Consulta fechas, habitaciones y servicios.'],['2','Solicita','Revisa el total y envía tu solicitud.'],['3','Confirma','Paga y espera la verificación del resort.'],['4','Disfruta','Gestiona tu estancia y liquida tus consumos al salir.']].map(([n,title,copy])=><article key={n}><span>{n}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
  </>;
}
export function LuxuryFooter({Brand}){
  return <footer className="lux-footer"><div className="wrap lux-footer-grid"><div><Brand/><p>Un concepto de resort de lujo en Viacha, La Paz, Bolivia.</p><span className="lux-stars">★★★★★</span></div><div><h3>Descubre Paradise</h3><a href="#/habitaciones">Alojamiento</a><a href="#/experiencias">Experiencias y bienestar</a><a href="#/guia">Destinos y excursiones</a></div><div><h3>Tu visita</h3><a href="#/cuenta">Mi estancia y pagos</a><a href="#/habitaciones">Consultar disponibilidad</a><a href="#/gestion">Acceso del equipo</a></div><div><h3>Información</h3><p>Viacha · La Paz · Bolivia</p><p>Proyecto demostrativo. Imágenes y servicios referenciales.</p></div></div><div className="wrap lux-footer-bottom"><span>© {new Date().getFullYear()} Paradise Resort Viacha</span><a href="#/">Volver al inicio ↑</a></div></footer>;
}
