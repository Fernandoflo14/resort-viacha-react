import React,{useEffect,useState} from 'react';
import {auth,booking,request} from './api.js';
import {ResortCatalog} from './resort-catalog.jsx';

const labels={admin:'Administración',staff:'Recepción',manager:'Gerencia',housekeeping:'Limpieza',maintenance:'Mantenimiento',services:'Servicios',finance:'Finanzas'};
const money=cents=>new Intl.NumberFormat('es-BO',{style:'currency',currency:'BOB'}).format((cents||0)/100);
const displayRoom=r=>r.number+' · '+r.category;
function Field({label,children}){return <label>{label}{children}</label>}
function Form({children,onSubmit,label='Guardar'}){
  const [busy,setBusy]=useState(false);
  return <form className="form-stack pms-form" onSubmit={async e=>{e.preventDefault();const values=Object.fromEntries(new FormData(e.currentTarget));setBusy(true);try{await onSubmit(values)}finally{setBusy(false)}}}>{children}<button className="button" disabled={busy}>{busy?'Procesando…':label}</button></form>;
}
function usePanel(session){
  const [notice,setNotice]=useState(null),[version,reload]=useState(0);
  const call=async(url,method,data)=>{
    try{const result=await request(url,{token:session.token,method,data});setNotice({text:'Operación registrada correctamente.'});reload(v=>v+1);return result}
    catch(error){session.expire(error);setNotice({error:true,text:error.message});return null}
  };
  return {notice,version,call};
}
function useData(url,session,version){
  const [state,setState]=useState({});
  useEffect(()=>{if(!url||!session.token)return;let live=true;const controller=new AbortController();setState({loading:true});request(url,{token:session.token,signal:controller.signal}).then(result=>{if(live)setState({result})}).catch(error=>{if(live&&error.name!=='AbortError'){session.expire(error);setState({error:error.message})}});return()=>{live=false;controller.abort()}},[url,session.token,version]);
  return state;
}
function Status({value}){return <span className={'pms-badge '+(value==='lista'||value==='cobrada'||value==='finalizada'?'pms-good':'')}>{(value||'').replaceAll('_',' ')}</span>}
function Empty({children}){return <p className="muted">{children}</p>}
function Folio({value,session,panel,proofs=[]}){
  const id=value.stay.id,role=session.user.role;
  const reception=['admin','staff','manager'].includes(role);
  const cashier=reception||role==='finance';
  return <section className="panel pms-folio">
    <h2>Cuenta de estancia #{id}</h2>
    <div className="pms-metrics"><article><small>Total de la estancia</small><strong>{money((value.lodging?.amount||0)*100+value.extras)}</strong></article><article><small>Alojamiento</small><strong>{money(value.lodging?.amount*100)}</strong><Status value={value.lodging?.status}/></article><article><small>Consumos</small><strong>{money(value.extras)}</strong></article><article><small>Saldo a liquidar</small><strong>{money(value.balance+(value.lodgingBalance||0))}</strong></article></div>
    <h3>Cargos registrados</h3>{value.charges.length?value.charges.map(c=><div className="pms-line" key={c.id}><span>{c.quantity} × {c.description}</span><strong>{money(c.amount_cents)}</strong></div>):<Empty>Sin consumos registrados.</Empty>}
    <h3>Pagos de consumos</h3>{value.settlements.map(p=><div className="pms-line" key={p.id}><span>{p.method} · {p.reference}</span><strong>{money(p.amount_cents)}</strong></div>)}
    {cashier&&value.stay.status==='alojado'&&value.balance>0&&<Form label="Registrar pago verificado" onSubmit={v=>panel.call(booking+'/pms/stays/'+id+'/payments','POST',{amountCents:Math.round(Number(v.amount)*100),method:v.method,reference:v.reference})}>
      <Field label="Importe (Bs)"><input key={value.balance} type="number" name="amount" min=".01" max={value.balance/100} defaultValue={value.balance/100} step=".01" required/></Field><Field label="Método"><select name="method"><option value="efectivo">Efectivo</option><option value="qr">QR</option><option value="tarjeta">Tarjeta en terminal</option></select></Field><Field label="Referencia del comprobante"><input name="reference" required maxLength="60"/></Field><small>Confirma únicamente un pago recibido y comprobado. El importe inicial cubre todos los consumos pendientes.</small>
    </Form>}
    {role==='guest'&&value.stay.status==='alojado'&&value.balance>0&&(!proofs.some(p=>p.stay_id===id&&p.status==='pendiente')?<Form label="Enviar comprobante del saldo completo" onSubmit={v=>panel.call(booking+'/pms/stays/'+id+'/proof','POST',{reference:v.reference})}><p>Transfiere {money(value.balance)} utilizando los datos QR configurados y envía la referencia bancaria. Recepción debe validar el cobro.</p><Field label="Referencia bancaria"><input name="reference" maxLength="60" required/></Field></Form>:<p className="notice">Tu pago de consumos está en revisión.</p>)}
    {reception&&value.stay.status==='alojado'&&<button className="button" disabled={value.balance!==0||value.lodging?.status!=='cobrada'} onClick={()=>panel.call(booking+'/pms/stays/'+id+'/check-out','POST',{})}>Finalizar estancia</button>}
    <button className="button secondary" onClick={()=>window.print()}>Imprimir liquidación de estancia (comprobante interno)</button>
  </section>;
}
export function GuestStay({session}){
  const panel=usePanel(session);
  const state=useData(booking+'/pms/mine',session,panel.version);
  const payments=useData(booking+'/payments',session,panel.version);
  const settings=useData(booking+'/pms/payment-settings',session,panel.version);
  const data=state.result?.data;
  const unpaid=(payments.result?.payments||[]).filter(p=>p.status==='pendiente');
  return <section className="panel pms-guest"><p className="overline">TU VISITA</p><h2>Mi estancia y comprobantes</h2>
    {panel.notice&&<p className={'notice '+(panel.notice.error?'error':'')} role="status">{panel.notice.text}</p>}
    {state.error&&<p role="alert">{state.error}</p>}
    <div className="guest-summary"><article><small>Total pendiente de reservas</small><strong>{money(unpaid.reduce((n,p)=>n+p.amount*100,0))}</strong></article><article><small>Solicitudes por pagar</small><strong>{unpaid.length}</strong></article></div>
    {unpaid.map(p=><div className="pms-line" key={p.id}><span>{p.kind==='habitacion'?'Alojamiento':'Actividad'} · {p.method==='qr'?'Transferencia QR':p.method==='tarjeta'?'Tarjeta en recepción':'Efectivo en recepción'}</span><strong>{money(p.amount*100)}</strong></div>)}
    <p>Envía la referencia del comprobante de tu transferencia QR. El personal comprobará el ingreso; enviar la referencia no equivale a pagar.</p>
    {settings.result?.data?.beneficiary?<div className="pms-qr"><strong>Beneficiario: {settings.result.data.beneficiary}</strong><p>{settings.result.data.instructions}</p>{settings.result.data.qr_image&&<img src={settings.result.data.qr_image} alt="QR bancario configurado por administración"/>}</div>:<p className="muted">Aún no hay datos bancarios configurados. Consulta a recepción antes de realizar una transferencia.</p>}
    {unpaid.filter(p=>p.method==='qr').map(p=><Form key={p.id} label="Enviar comprobante" onSubmit={v=>panel.call(booking+'/pms/proofs','POST',{paymentId:p.id,reference:v.reference})}><strong>{p.kind==='habitacion'?'Alojamiento':'Actividad'} · {money(p.amount*100)}</strong><small>Identificador de solicitud: {p.code}</small><Field label="Referencia bancaria"><input name="reference" required maxLength="60"/></Field></Form>)}
    {data?.proofs.map(p=><div className="pms-line" key={p.id}><span>{p.reference}</span><Status value={p.status}/></div>)}
    {data?.stays.map(s=><Folio key={s.stay.id} value={s} session={session} panel={panel} proofs={data.stayProofs||[]}/>)}
    {!data?.stays.length&&<Empty>Tus estancias aparecerán cuando recepción registre tu llegada.</Empty>}
  </section>;
}
function Employees({session,panel}){
  const directory=useData(auth+'/staff',session,panel.version);
  const [editing,setEditing]=useState(null);
  const employ=directory.result?.employees||[];
  const roleOptions=Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>);
  return <section className="panel"><h2>Equipo y permisos</h2>
    <div className="pms-table">{employ.map(e=><div className="pms-line" key={e.id}><div><strong>{e.name||e.email}</strong><small>{e.email} · {labels[e.role]} · {e.department}</small></div><Status value={e.active?'activo':'inactivo'}/><button className="button secondary" disabled={e.id===session.user.id} onClick={()=>setEditing(e)}>Editar</button></div>)}</div>
    <h3>{editing?'Editar empleado':'Crear empleado'}</h3>
    <Form key={editing?.id||'new'} label={editing?'Guardar permisos':'Crear cuenta del empleado'} onSubmit={async v=>{const data={name:v.name,department:v.department,role:v.role,active:v.active==='1',email:v.email,password:v.password};const result=await panel.call(auth+'/staff'+(editing?'/'+editing.id:''),editing?'PUT':'POST',data);if(result)setEditing(null)}}>
      <div className="field-grid"><Field label="Nombre"><input name="name" required maxLength="60" defaultValue={editing?.name}/></Field><Field label="Departamento"><input name="department" maxLength="80" defaultValue={editing?.department}/></Field></div>
      {!editing&&<><Field label="Correo"><input type="email" name="email" required/></Field><Field label="Contraseña inicial"><input type="password" name="password" required minLength="8" autoComplete="new-password"/></Field></>}
      <Field label="Rol"><select name="role" defaultValue={editing?.role||'staff'}>{roleOptions}</select></Field>
      {editing&&<Field label="Estado"><select name="active" defaultValue={String(editing.active)}><option value="1">Activo</option><option value="0">Desactivado</option></select></Field>}
    </Form>{editing&&<button className="button secondary" onClick={()=>setEditing(null)}>Cancelar edición</button>}
  </section>
}
function PaymentSettings({session,panel}){
  const state=useData(booking+'/pms/payment-settings',session,panel.version);
  const [qr,setQr]=useState(null);
  const current=state.result?.data;
  return <section className="panel"><h2>Datos de pago QR</h2><p>Configura únicamente un QR emitido por el banco del establecimiento. No se verifica automáticamente ningún ingreso.</p>
    {current&&<Form key={panel.version} label="Guardar instrucciones de pago" onSubmit={v=>panel.call(booking+'/pms/payment-settings','PUT',{beneficiary:v.beneficiary,instructions:v.instructions,qrImage:qr??current.qr_image})}>
      <Field label="Beneficiario"><input name="beneficiary" defaultValue={current.beneficiary} required maxLength="100"/></Field>
      <Field label="Instrucciones"><textarea name="instructions" defaultValue={current.instructions} required maxLength="500"/></Field>
      <Field label="Imagen bancaria del QR"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files[0];if(!file)return;if(file.size>190000){e.target.value='';return;}const reader=new FileReader();reader.onload=()=>setQr(reader.result);reader.readAsDataURL(file)}}/></Field>
      {(qr??current.qr_image)&&<div className="pms-qr"><img alt="Vista previa del QR" src={qr??current.qr_image}/><button type="button" className="button secondary" onClick={()=>setQr('')}>Quitar imagen</button></div>}
    </Form>}
  </section>
}
export function PMS({session}){
  const role=session.user?.role;
  const panel=usePanel(session);
  const [tab,setTab]=useState('overview'),[selected,setSelected]=useState(null);
  const state=useData(role&&role!=='guest'?booking+'/pms/dashboard':null,session,panel.version);
  const clients=useData(['admin','staff','manager','finance'].includes(role)&&tab==='clients'?auth+'/customers':null,session,panel.version);
  const detail=useData(selected?booking+'/pms/stays/'+selected:null,session,panel.version);
  const data=state.result?.data;
  const reception=['admin','staff','manager'].includes(role),finance=reception||role==='finance',services=reception||role==='services';
  const nav=[['overview','Resumen'],...(reception?[['arrivals','Llegadas']]:[]),...(finance?[['stays','Estancias y caja'],['proofs','Comprobantes QR'],['clients','Clientes']]:[]),...(services?[['services','Consumos']]:[]),...((reception||['housekeeping','maintenance'].includes(role))?[['tasks','Tareas']]:[]),...(['admin','manager'].includes(role)?[['catalog','Catálogo']]:[]),...(role==='admin'?[['employees','Empleados']]:[])];
  if(role==='admin')nav.push(['settings','Pago QR']);
  if(['admin','manager'].includes(role))nav.push(['offers','Ofertas y tarifas']);
  if(!role||role==='guest')return <section className="wrap page"><h1>Acceso del equipo</h1><p>Inicia sesión con una cuenta autorizada.</p><a href="#/cuenta" className="button">Mi cuenta</a></section>;
  return <section className="wrap page pms-workspace">
    <header className="pms-header"><div><p className="overline">PARADISE · OPERACIONES</p><h1>{labels[role]}</h1><p>Gestiona cada estancia con información actualizada.</p></div><a href="#/cuenta" className="button secondary">Mi cuenta</a></header>
    <nav className="pms-nav" aria-label="Módulos operativos">{nav.map(([key,label])=><button className={tab===key?'selected':''} key={key} onClick={()=>{setTab(key);setSelected(null)}}>{label}</button>)}{finance&&<a href="#/operaciones">Historial de reservas</a>}</nav>
    {panel.notice&&<p role="status" className={'notice '+(panel.notice.error?'error':'')}>{panel.notice.text}</p>}{state.error&&<p role="alert">{state.error}</p>}{state.loading&&<p role="status">Actualizando información…</p>}
    {data&&tab==='overview'&&<><div className="pms-metrics"><article><small>Habitaciones</small><strong>{data.rooms?.length||0}</strong></article><article><small>Estancias activas</small><strong>{data.active?.length||0}</strong></article><article><small>Tareas pendientes</small><strong>{data.tasks?.length||0}</strong></article><article><small>Comprobantes por revisar</small><strong>{data.proofs?.length||0}</strong></article></div>{data.rooms&&<section className="panel"><h2>Estado operativo</h2><div className="pms-room-grid">{data.rooms.map(r=><article key={r.id}><strong>{r.number}</strong><small>{r.category}</small><Status value={r.stay_id?'ocupada':r.condition}/></article>)}</div></section>}</>}
    {data&&tab==='arrivals'&&<section className="panel"><h2>Registrar llegada</h2>{data.reservations.filter(r=>r.status==='confirmada'&&!r.stay_id).map(r=><Form key={r.id} label="Registrar check-in" onSubmit={v=>panel.call(booking+'/pms/check-in','POST',{reservationId:r.id,roomId:Number(v.room)})}><strong>PR-{r.id} · Cuenta {r.user_id} · {r.check_in} a {r.check_out} · {r.room}</strong><Field label="Habitación preparada"><select name="room" required><option value="">Selecciona</option>{data.rooms.filter(room=>room.category===r.room&&!room.stay_id&&room.condition==='lista').map(room=><option key={room.id} value={room.id}>{displayRoom(room)}</option>)}</select></Field></Form>)}</section>}
    {data&&tab==='stays'&&<section className="panel"><h2>Selecciona una estancia</h2>{data.active.map(s=><button className="button secondary" key={s.id} onClick={()=>setSelected(s.id)}>Estancia {s.id} · Reserva {s.reservation_id}</button>)}{detail.result?.data&&<Folio value={detail.result.data} session={session} panel={panel}/>}</section>}
    {data&&tab==='proofs'&&<section className="panel"><h2>Comprobantes pendientes</h2>{!data.proofs.length&&<Empty>Sin comprobantes por revisar.</Empty>}{data.proofs.map(p=><div className="pms-line" key={p.id}><div><strong>{p.reference} · {money(p.amount*100)}</strong><small>Reserva {p.booking_id} · Cuenta {p.user_id}</small></div><button className="button" onClick={()=>{if(window.confirm('¿Comprobaste que el dinero fue recibido?'))panel.call(booking+'/pms/proofs/'+p.id+'/review','POST',{approve:true})}}>Verificar cobro</button><button className="button secondary" onClick={()=>panel.call(booking+'/pms/proofs/'+p.id+'/review','POST',{approve:false})}>Rechazar</button></div>)}</section>}
    {data&&tab==='proofs'&&<section className="panel"><h2>Pagos de liquidación de estancia</h2>{!data.stayProofs?.length&&<Empty>Sin liquidaciones pendientes.</Empty>}{data.stayProofs?.map(p=><div className="pms-line" key={p.id}><div><strong>{money(p.amount_cents)}</strong><small>Estancia {p.stay_id} · Referencia {p.reference}</small></div><button className="button" onClick={()=>{if(window.confirm('¿Verificaste el ingreso del saldo completo?'))panel.call(booking+'/pms/stay-proofs/'+p.id+'/review','POST',{approve:true})}}>Verificar liquidación</button><button className="button secondary" onClick={()=>panel.call(booking+'/pms/stay-proofs/'+p.id+'/review','POST',{approve:false})}>Rechazar</button></div>)}</section>}
    {tab==='clients'&&<section className="panel"><h2>Clientes registrados</h2>{clients.error&&<p>{clients.error}</p>}{clients.result?.customers?.map(c=><div className="pms-line" key={c.id}><strong>{c.name||'Huésped '+c.id}</strong><span>{c.email}</span></div>)}</section>}
    {data&&tab==='services'&&<section className="panel"><h2>Registrar consumo</h2><Form label="Cargar a la estancia" onSubmit={v=>panel.call(booking+'/pms/stays/'+v.stay+'/charges','POST',{productId:Number(v.product),quantity:Number(v.quantity)})}><Field label="Estancia"><select name="stay" required><option value="">Seleccionar</option>{data.active.map(s=><option key={s.id} value={s.id}>Estancia {s.id}</option>)}</select></Field><Field label="Servicio"><select name="product" required>{data.catalog.filter(p=>p.enabled).map(p=><option key={p.id} value={p.id}>{p.name} · {money(p.price_cents)}</option>)}</select></Field><Field label="Cantidad"><input type="number" name="quantity" min="1" max="50" defaultValue="1" required/></Field></Form></section>}
    {data&&tab==='tasks'&&<section className="panel"><h2>Tareas del equipo</h2>{data.tasks.map(t=><div className="pms-line" key={t.id}><div><strong>Habitación {t.number} · {t.kind}</strong><small>{t.description}</small></div><Status value={t.status}/><button className="button" onClick={()=>panel.call(booking+'/pms/tasks/'+t.id,'PUT',{status:t.status==='pendiente'?'en_proceso':'finalizada'})}>{t.status==='pendiente'?'Iniciar':'Finalizar'}</button></div>)}</section>}
    {data&&tab==='catalog'&&<section className="panel"><h2>Catálogo de consumos</h2>{data.catalog.map(p=><div className="pms-line" key={p.id}><span>{p.name} · {p.category}</span><strong>{money(p.price_cents)}</strong></div>)}<Form label="Agregar servicio" onSubmit={v=>panel.call(booking+'/pms/catalog','POST',{name:v.name,category:v.category,priceCents:Math.round(Number(v.price)*100)})}><Field label="Nombre"><input name="name" required maxLength="80"/></Field><Field label="Categoría"><input name="category" required maxLength="50"/></Field><Field label="Precio (Bs)"><input name="price" type="number" step=".01" min=".01" required/></Field></Form></section>}
    {tab==='employees'&&<Employees session={session} panel={panel}/>}
    {tab==='settings'&&role==='admin'&&<PaymentSettings session={session} panel={panel}/>}
    {tab==='offers'&&<ResortCatalog session={session}/>}
  </section>;
}
