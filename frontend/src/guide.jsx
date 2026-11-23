import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const origin = [-16.5042006, -68.1311518];
const destinations = [
  { name: 'Charquini', coordinates: [-16.2992778, -68.1011031], image: 'viaje1.jpg', text: 'Paisajes del altiplano y senderos de montaña.' },
  { name: 'Tiwanaku', coordinates: [-16.5553030, -68.6735141], image: 'viaje2.jpg', text: 'Un recorrido por el patrimonio arqueológico de Bolivia.' },
  { name: 'Bar y coctelería', image: 'bar1.jpg', text: 'Una pausa al final del día. Ubicación pendiente de confirmar.' },
  { name: 'Valle de la Luna', coordinates: [-16.566817, -68.094475], text: 'Formaciones de arcilla y senderos en el sur de La Paz.' },
  { name: 'Mirador Killi Killi', coordinates: [-16.495058, -68.127445], text: 'Un mirador con vistas panorámicas sobre la ciudad.' },
];

function RouteDialog({ destination, close }) {
  const dialog = useRef(null);
  const container = useRef(null);
  const [status, setStatus] = useState('Consultando la ruta por carretera…');
  const [tiles, setTiles] = useState('');
  const points = [origin, destination.coordinates];

  useEffect(() => {
    dialog.current.showModal();
    const controller = new AbortController();
    let disposed = false;
    const map = L.map(container.current).fitBounds(points, { padding: [35, 35] });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://project-osrm.org/">OSRM</a>',
    }).on('tileerror', () => setTiles('Algunas partes del mapa no pudieron cargar.')).addTo(map);
    for (const [index, point] of points.entries()) {
      L.circleMarker(point, { radius: 7, color: '#fff', weight: 2, fillColor: '#153a32', fillOpacity: 1 })
        .addTo(map).bindTooltip(index === 0 ? 'Plaza del Estudiante' : destination.name);
    }
    const coordinates = points.map(([lat, lon]) => lon + ',' + lat).join(';');
    const timeout = setTimeout(() => controller.abort(), 15_000);
    fetch('https://router.project-osrm.org/route/v1/driving/' + coordinates + '?overview=full&geometries=geojson&steps=false',
      { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error();
      const data = await response.json();
      const route = data.routes?.[0];
      if (disposed || controller.signal.aborted) return;
      if (data.code !== 'Ok' || !route?.geometry) throw new Error();
      const line = L.geoJSON(route.geometry, { style: { color: '#15654a', weight: 5 } }).addTo(map);
      map.fitBounds(line.getBounds(), { padding: [25, 25] });
      const distance = (route.distance / 1000).toLocaleString('es-BO', { maximumFractionDigits: 1 });
      const remaining = Math.round(data.waypoints?.[1]?.distance);
      setStatus(distance + ' km por carretera.' + (remaining > 50 ? ' Quedan aproximadamente ' + remaining + ' m en línea recta desde el final de la ruta hasta el destino.' : ''));
    }).catch(() => {
      if (!disposed) setStatus('No se pudo calcular la ruta. Puedes abrir los puntos en OpenStreetMap.');
    }).finally(() => clearTimeout(timeout));
    return () => { disposed = true; controller.abort(); clearTimeout(timeout); map.remove(); };
  }, [destination]);

  const external = 'https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=' + encodeURIComponent(points.map(point => point.join(',')).join(';'));
  return <dialog ref={dialog} className="route-dialog" aria-labelledby="route-title" onClose={close}>
    <header className="with-action"><div><p className="overline">DESDE LA PLAZA DEL ESTUDIANTE</p>
      <h2 id="route-title">Ruta a {destination.name}</h2></div>
      <button className="icon-button" aria-label="Cerrar mapa" autoFocus onClick={() => dialog.current.close()}>×</button></header>
    <div className="map" ref={container} aria-label="Mapa de la ruta" />
    <p role="status">{status}</p>{tiles && <p role="status">{tiles}</p>}
    <a href={external} className="text-link" target="_blank" rel="noreferrer">Abrir en OpenStreetMap ↗</a>
  </dialog>;
}

export function Guide() {
  const [destination, setDestination] = useState(null);
  const trigger = useRef(null);
  function close() {
    setDestination(null);
    trigger.current?.focus();
  }
  return <section className="wrap page">
    <div className="page-heading"><p className="overline">ALREDEDORES DE VIACHA</p><h1>Guía local</h1>
      <p>Explora la región y consulta recorridos desde la Plaza del Estudiante, La Paz.</p></div>
    <div className="cards">{destinations.map(place =>
      <article className="card" key={place.name}>{place.image ? <img src={'/assets/' + place.image} alt={place.name} /> : <div className="destination-marker" aria-hidden="true">↗</div>}
        <div className="card-body"><h2>{place.name}</h2><p>{place.text}</p>
          {place.coordinates && <button className="button secondary" onClick={event => {
            trigger.current = event.currentTarget;
            setDestination(place);
          }}>Ver ruta <span aria-hidden="true">↗</span></button>}</div>
      </article>)}</div>
    {destination && <RouteDialog destination={destination} close={close} />}
  </section>;
}
