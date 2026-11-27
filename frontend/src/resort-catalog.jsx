import React,{useEffect,useState} from 'react';
import {booking,request} from './api.js';
const images=['cuarto1.jpg','cuarto2.jpg','cuarto3.jpg','piscina.jpg','bar1.jpg','viaje1.jpg','viaje2.jpg','demo1.jpg','demo2.jpg','fondo.jpg'];
export function ResortCatalog({session}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[editing,setEditing]=useState(null),[kind,setKind]=useState('room'),[busy,setBusy]=useState(false);
 const load=()=>request(booking+'/pms/resort-catalog',{token:session.token}).then(r=>setData(r.data)).catch(e=>setError(e.message));
 useEffect(()=>{load()},[session.token]);
 const items=kind==='room'?data?.rooms:data?.experiences;
 const edit=item=>{setEditing(item);setNotice('');setError('')};
 async function save(e){
  e.preventDefault();const fields=Object.fromEntries(new FormData(e.currentTarget));setBusy(true);setError('');setNotice('');
  try{await request(booking+'/pms/resort-catalog',{method:'PUT',token:session.token,data:{...fields,kind,price:Number(fields.price),capacity:Number(fields.capacity),enabled:fields.enabled==='true',slots:(fields.slots||'').split(',').map(s=>s.trim()).filter(Boolean)}});setNotice('Catálogo actualizado. Los nuevos precios se aplicarán a futuras solicitudes.');setEditing(null);await load()}catch(e){setError(e.message)}finally{setBusy(false)}
 }
 return <section className="panel"><h2>Ofertas y tarifas públicas</h2><p>Los cambios se reflejan en las nuevas reservas; las reservas anteriores conservan su importe.</p>
  <div className="guest-tabs"><button aria-pressed={kind==='room'} onClick={()=>{setKind('room');setEditing(null)}}>Habitaciones</button><button aria-pressed={kind==='experience'} onClick={()=>{setKind('experience');setEditing(null)}}>Actividades</button></div>
  {error&&<p className="notice error" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}
  {!data?<p>Cargando catálogo…</p>:<>{items.map(item=><div className="pms-line" key={item.id}><div><strong>{item.name}</strong><small>Bs {item.price} · {item.enabled?'Publicado':'Oculto'}</small></div><button className="button secondary" onClick={()=>edit(item)}>Editar</button></div>)}
  {kind==='experience'&&<button className="button" onClick={()=>edit({id:'',name:'',price:100,category:'Bienestar',description:'',capacity:8,slots:['10:00'],image:'/assets/demo1.jpg',enabled:true})}>Nueva actividad</button>}
  {editing&&<form key={editing.id||'new'} className="form-stack pms-form" onSubmit={save}><h3>{editing.id?'Editar oferta':'Nueva oferta'}</h3>
    <label>Identificador (sin espacios)<input name="id" readOnly={!!editing.id} defaultValue={editing.id} required pattern="[a-z0-9-]+" maxLength="40"/></label>
    <label>Nombre visible<input name="name" defaultValue={editing.name} required maxLength="80"/></label>
    <label>Precio en bolivianos<input name="price" type="number" min="1" max="100000" step="1" required defaultValue={editing.price}/></label>
    <label>Publicación<select name="enabled" defaultValue={String(editing.enabled)}><option value="true">Publicado</option><option value="false">Oculto</option></select></label>
    {kind==='experience'&&<><label>Categoría<input name="category" defaultValue={editing.category} required maxLength="40"/></label><label>Descripción<textarea name="description" defaultValue={editing.description} required maxLength="350"/></label><label>Cupo por turno<input name="capacity" type="number" min="1" max="100" required defaultValue={editing.capacity}/></label><label>Horarios separados por comas<input name="slots" defaultValue={editing.slots.join(', ')} required placeholder="09:00, 14:00"/></label><label>Imagen<select name="image" defaultValue={editing.image}>{images.map(im=><option key={im} value={'/assets/'+im}>{im}</option>)}</select></label></>}
    <button disabled={busy} className="button">{busy?'Guardando…':'Publicar cambios del catálogo'}</button><button type="button" className="button secondary" onClick={()=>setEditing(null)}>Cancelar</button>
  </form>}</>}
 </section>
}
