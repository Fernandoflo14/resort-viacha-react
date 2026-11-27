import {rooms} from '../domain/rooms.js';
import {experiences} from '../domain/experiences.js';
import {ApplicationError} from '../../shared/application-error.js';

const extra=[
 {id:'spa',name:'Masaje y relajación',category:'Bienestar',description:'Sesión de bienestar de 50 minutos en el spa.',image:'/assets/demo1.jpg',price:180,capacity:2,slots:['10:00','12:00','15:00','17:00']},
 {id:'yoga',name:'Yoga al amanecer',category:'Bienestar',description:'Una sesión guiada para comenzar el día con calma.',image:'/assets/fondo.jpg',price:70,capacity:12,slots:['07:00','09:00']},
 {id:'senderismo',name:'Senderismo interpretativo',category:'Aventura',description:'Recorrido guiado por el paisaje del altiplano con salida desde el resort.',image:'/assets/viaje1.jpg',price:130,capacity:10,slots:['08:00','14:00']},
 {id:'bike',name:'Ruta en bicicleta',category:'Aventura',description:'Paseo recreativo con bicicleta y acompañamiento.',image:'/assets/viaje2.jpg',price:95,capacity:8,slots:['09:00','15:00']},
 {id:'desayuno',name:'Desayuno de autor',category:'Gastronomía',description:'Desayuno con productos locales y bebidas calientes.',image:'/assets/bar1.jpg',price:60,capacity:16,slots:['08:00','09:30']},
 {id:'picnic',name:'Picnic del altiplano',category:'Gastronomía',description:'Una selección de sabores para disfrutar al aire libre.',image:'/assets/demo2.jpg',price:100,capacity:10,slots:['12:00','15:00']},
 {id:'cultura',name:'Taller de cultura andina',category:'Cultura',description:'Encuentro guiado con tradiciones, artesanía y relatos locales.',image:'/assets/viaje2.jpg',price:85,capacity:14,slots:['11:00','16:00']},
];
const fail=(status,message)=>{throw new ApplicationError(status,message)};
const safeText=(v,max)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max)fail(400,'Revisa los textos del catálogo.');return v.trim()};
const integer=(v,min,max)=>{if(!Number.isInteger(v)||v<min||v>max)fail(400,'Indica un importe o cupo válido.');return v};
const images=['cuarto1.jpg','cuarto2.jpg','cuarto3.jpg','piscina.jpg','bar1.jpg','viaje1.jpg','viaje2.jpg','demo1.jpg','demo2.jpg','fondo.jpg'];
const capacities={estandar:2,deluxe:3,familiar:6,terraza:3,presidencial:4};
export function resortCatalog(db){
 db.exec(`CREATE TABLE IF NOT EXISTS resort_catalog(kind TEXT NOT NULL,id TEXT NOT NULL,definition TEXT NOT NULL,PRIMARY KEY(kind,id))`);
 const seed=db.prepare('INSERT OR IGNORE INTO resort_catalog VALUES(?,?,?)');
 for(const room of rooms)seed.run('room',room.id,JSON.stringify({...room,capacity:capacities[room.id],enabled:true}));
 for(const item of [...experiences,...extra])seed.run('experience',item.id,JSON.stringify({...item,enabled:true}));
 const list=kind=>db.prepare('SELECT definition FROM resort_catalog WHERE kind=? ORDER BY rowid').all(kind).map(r=>JSON.parse(r.definition));
 const find=(kind,id)=>{const row=db.prepare('SELECT definition FROM resort_catalog WHERE kind=? AND id=?').get(kind,id);return row?JSON.parse(row.definition):undefined};
 return {
  rooms:()=>list('room').filter(x=>x.enabled),room:id=>find('room',id),
  experiences:()=>list('experience').filter(x=>x.enabled),experience:id=>find('experience',id),
  manage(actor){if(!['admin','manager'].includes(actor.role))fail(403,'Acceso reservado a administración.');return {rooms:list('room'),experiences:list('experience')}},
  save(actor,kind,input){
   if(!['admin','manager'].includes(actor.role))fail(403,'Acceso reservado a administración.');
   if(!['room','experience'].includes(kind))fail(400,'Tipo de catálogo inválido.');
   const id=safeText(input.id,40);if(!/^[a-z0-9-]+$/.test(id))fail(400,'Identificador inválido.');
   const previous=find(kind,id);if(kind==='room'&&!previous)fail(400,'Solo se pueden configurar las categorías de alojamiento existentes.');
   if(typeof input.enabled!=='boolean')fail(400,'Selecciona el estado de publicación.');
   const common={id,name:safeText(input.name,80),price:integer(input.price,1,100000),enabled:input.enabled};
   let row;
   if(kind==='room')row={...previous,...common};else{
    const slots=Array.isArray(input.slots)?[...new Set(input.slots)]:[];
    if(!slots.length||slots.length>12||slots.some(s=>typeof s!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)))fail(400,'Horarios inválidos.');
    const image=String(input.image||'').replace('/assets/','');if(!images.includes(image))fail(400,'Selecciona una imagen del resort.');
    row={...common,description:safeText(input.description,350),category:safeText(input.category,40),capacity:integer(input.capacity,1,100),slots:slots.sort(),image:'/assets/'+image};
   }
   db.prepare('INSERT INTO resort_catalog VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET definition=excluded.definition').run(kind,id,JSON.stringify(row));return row;
  }
 };
}
