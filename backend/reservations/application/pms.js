import { ApplicationError } from '../../shared/application-error.js';
import { transaction } from '../../shared/database.js';
import { today } from '../domain/rooms.js';

const fail = (status,message) => { throw new ApplicationError(status,message); };
const reception = ['admin','staff','manager'];
const finance = [...reception,'finance'];
const ops = [...reception,'housekeeping','maintenance','services','finance'];
const requireRole = (actor,allowed) => { if(!allowed.includes(actor.role)) fail(403,'No tienes permiso para esta operación.'); };
const number = (value,min,max) => { if(!Number.isSafeInteger(value)||value<min||value>max) fail(400,'Cantidad fuera del rango permitido.'); return value; };
const text = (value,max=100) => { if(typeof value!=='string'||!value.trim()||value.trim().length>max) fail(400,'Completa un texto válido.');return value.trim(); };

export function pms(db) {
  const get = (sql,...args) => db.prepare(sql).get(...args);
  const all = (sql,...args) => db.prepare(sql).all(...args);
  const run = (sql,...args) => db.prepare(sql).run(...args);
  const audit = (actor,action,id) => run('INSERT INTO pms_audit(actor_id,action,object_id) VALUES(?,?,?)',actor.id,action,id);
  const stay = id => {
    const row=get(`SELECT s.*,r.user_id,r.check_in,r.check_out,r.status AS reservation_status
      FROM pms_stays s JOIN reservations r ON r.id=s.reservation_id WHERE s.id=?`,id);
    if(!row) fail(404,'Estancia no encontrada.');
    return row;
  };
  function folio(id) {
    const row=stay(id);
    const charges=all('SELECT * FROM pms_charges WHERE stay_id=? ORDER BY id',id);
    const settlements=all('SELECT * FROM pms_settlements WHERE stay_id=? ORDER BY id',id);
    const lodging=get("SELECT * FROM payments WHERE kind='habitacion' AND booking_id=?",row.reservation_id);
    const extras=charges.reduce((sum,item)=>sum+item.amount_cents,0);
    const paid=settlements.reduce((sum,item)=>sum+item.amount_cents,0);
    return {stay:row,lodging,charges,settlements,extras,paid,balance:extras-paid,
      lodgingBalance:lodging?.status==='cobrada'?0:lodging?.amount*100};
  }
  return {
    settings() {
      return get('SELECT beneficiary,instructions,qr_image FROM pms_payment_settings WHERE id=1');
    },
    configurePayment(actor,input) {
      requireRole(actor,['admin']);
      const beneficiary=text(input.beneficiary,100), instructions=text(input.instructions,500);
      const image=input.qrImage||'';
      if(typeof image!=='string'||image.length>260000||(image&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image))) fail(400,'Utiliza una imagen PNG, JPG o WebP del QR bancario.');
      run('UPDATE pms_payment_settings SET beneficiary=?,instructions=?,qr_image=? WHERE id=1',beneficiary,instructions,image);
      audit(actor,'payment_settings',1);
      return this.settings();
    },
    dashboard(actor) {
      requireRole(actor,ops);
      const rooms=all(`SELECT r.*,s.id AS stay_id FROM pms_rooms r LEFT JOIN pms_stays s ON s.room_id=r.id AND s.status='alojado' ORDER BY r.number`);
      const tasks=all("SELECT t.*,r.number FROM pms_tasks t JOIN pms_rooms r ON r.id=t.room_id WHERE t.status!='finalizada' ORDER BY t.id");
      if(['housekeeping','maintenance'].includes(actor.role)) return {rooms,tasks:tasks.filter(t=>t.kind===(actor.role==='housekeeping'?'limpieza':'mantenimiento'))};
      const active=all("SELECT * FROM pms_stays WHERE status='alojado' ORDER BY id");
      if(actor.role==='services') return {active,catalog:all('SELECT * FROM pms_catalog WHERE enabled=1 ORDER BY category,name')};
      return {rooms,tasks,active,catalog:all('SELECT * FROM pms_catalog ORDER BY category,name'),
        reservations:all(`SELECT r.*,s.id AS stay_id,s.status AS stay_status FROM reservations r LEFT JOIN pms_stays s ON s.reservation_id=r.id
          WHERE r.check_out>=? OR s.status='alojado' ORDER BY r.check_in LIMIT 500`,today()),
        proofs:all(`SELECT q.*,p.amount,p.kind,p.booking_id FROM pms_proofs q JOIN payments p ON p.id=q.payment_id WHERE q.status='pendiente' ORDER BY q.id`),
        stayProofs:all("SELECT * FROM pms_stay_proofs WHERE status='pendiente' ORDER BY id")};
    },
    mine(actor) {
      return {stays:all('SELECT s.id FROM pms_stays s JOIN reservations r ON r.id=s.reservation_id WHERE r.user_id=? ORDER BY s.id DESC',actor.id).map(s=>folio(s.id)),
        proofs:all('SELECT id,payment_id,reference,status,created_at FROM pms_proofs WHERE user_id=? ORDER BY id DESC',actor.id),
        stayProofs:all('SELECT * FROM pms_stay_proofs WHERE user_id=? ORDER BY id DESC',actor.id)};
    },
    checkIn(actor,input) {
      requireRole(actor,reception);
      return transaction(db,()=>{
        const r=get('SELECT * FROM reservations WHERE id=?',number(input.reservationId,1,Number.MAX_SAFE_INTEGER));
        if(!r||r.status!=='confirmada'||r.check_in>today()||r.check_out<=today()) fail(409,'La reserva no se puede registrar como llegada hoy.');
        if(get("SELECT status FROM payments WHERE kind='habitacion' AND booking_id=?",r.id)?.status!=='cobrada')fail(409,'Primero verifica el pago del alojamiento.');
        if(get('SELECT id FROM pms_stays WHERE reservation_id=?',r.id)) fail(409,'La reserva ya tiene una estancia.');
        const room=get("SELECT * FROM pms_rooms WHERE id=? AND condition='lista' AND category=?",number(input.roomId,1,Number.MAX_SAFE_INTEGER),r.room);
        if(!room||get("SELECT id FROM pms_stays WHERE room_id=? AND status='alojado'",room.id)) fail(409,'Habitación no disponible para esta categoría.');
        const result=get("INSERT INTO pms_stays(reservation_id,room_id,status,actor_id) VALUES(?,?,'alojado',?) RETURNING id",r.id,room.id,actor.id);
        audit(actor,'check_in',result.id); return folio(result.id);
      });
    },
    folio(actor,id) {
      const result=folio(id);
      if(result.stay.user_id!==actor.id) requireRole(actor,finance);
      return result;
    },
    charge(actor,id,input) {
      requireRole(actor,[...reception,'services']);
      return transaction(db,()=>{
        if(stay(id).status!=='alojado') fail(409,'La estancia está cerrada.');
        const product=get('SELECT * FROM pms_catalog WHERE id=? AND enabled=1',number(input.productId,1,Number.MAX_SAFE_INTEGER));
        if(!product) fail(404,'Servicio no disponible.');
        const qty=number(input.quantity,1,50);
        const row=get('INSERT INTO pms_charges(stay_id,product_id,description,quantity,amount_cents,actor_id) VALUES(?,?,?,?,?,?) RETURNING id',id,product.id,product.name,qty,qty*product.price_cents,actor.id);
        audit(actor,'charge',row.id);return {id:row.id};
      });
    },
    settle(actor,id,input) {
      requireRole(actor,finance);
      return transaction(db,()=>{
        const data=folio(id);
        if(data.stay.status!=='alojado') fail(409,'La estancia está cerrada.');
        const amount=number(input.amountCents,1,data.balance);
        if(!['qr','tarjeta','efectivo'].includes(input.method)) fail(400,'Método de pago inválido.');
        const reference=text(input.reference,60);
        if(get('SELECT id FROM pms_settlements WHERE reference=?',reference)||get('SELECT id FROM payment_events WHERE lower(reference)=lower(?)',reference)) fail(409,'Comprobante ya registrado.');
        const row=get('INSERT INTO pms_settlements(stay_id,amount_cents,method,reference,actor_id) VALUES(?,?,?,?,?) RETURNING id',id,amount,input.method,reference,actor.id);
        audit(actor,'settlement',row.id);return folio(id);
      });
    },
    checkOut(actor,id) {
      requireRole(actor,reception);
      return transaction(db,()=>{
        const data=folio(id);
        if(data.stay.status!=='alojado'||data.balance!==0||data.lodging?.status!=='cobrada') fail(409,'La estancia tiene cargos pendientes o requiere revisar el pago del alojamiento.');
        run("UPDATE pms_stays SET status='finalizado',check_out_at=CURRENT_TIMESTAMP WHERE id=?",id);
        run("UPDATE pms_rooms SET condition='limpieza' WHERE id=?",data.stay.room_id);
        run("INSERT INTO pms_tasks(room_id,kind,description,actor_id) VALUES(?,'limpieza','Preparar habitación tras salida',?)",data.stay.room_id,actor.id);
        audit(actor,'check_out',id);return folio(id);
      });
    },
    proof(actor,input) {
      return transaction(db,()=>{
        const payment=get("SELECT * FROM payments WHERE id=? AND user_id=? AND status='pendiente' AND method='qr'",number(input.paymentId,1,Number.MAX_SAFE_INTEGER),actor.id);
        if(!payment) fail(409,'No hay un pago QR pendiente para esta cuenta.');
        const reference=text(input.reference,60);
        if(get('SELECT id FROM pms_proofs WHERE reference=? OR (payment_id=? AND status=\'pendiente\')',reference,payment.id)||
           get('SELECT id FROM payment_events WHERE lower(reference)=lower(?)',reference)) fail(409,'Ya existe un comprobante para revisar.');
        return get('INSERT INTO pms_proofs(payment_id,user_id,reference) VALUES(?,?,?) RETURNING id,status',payment.id,actor.id,reference);
      });
    },
    stayProof(actor,id,input){
      return transaction(db,()=>{
        const data=folio(id);
        if(data.stay.user_id!==actor.id)fail(404,'Estancia no encontrada.');
        if(data.stay.status!=='alojado'||data.balance<=0)fail(409,'No hay saldo pendiente.');
        const reference=text(input.reference,60);
        if(get('SELECT id FROM pms_stay_proofs WHERE reference=? OR (stay_id=? AND status=\'pendiente\')',reference,id)||get('SELECT id FROM pms_settlements WHERE reference=?',reference)||get('SELECT id FROM payment_events WHERE lower(reference)=lower(?)',reference)||get('SELECT id FROM pms_proofs WHERE reference=?',reference))fail(409,'Ya existe un comprobante o referencia registrada.');
        return get('INSERT INTO pms_stay_proofs(stay_id,user_id,amount_cents,reference) VALUES(?,?,?,?) RETURNING *',id,actor.id,data.balance,reference);
      });
    },
    reviewStayProof(actor,id,input){
      requireRole(actor,finance);
      if(typeof input.approve!=='boolean')fail(400,'Indica aprobación o rechazo.');
      return transaction(db,()=>{
        const proof=get("SELECT * FROM pms_stay_proofs WHERE id=? AND status='pendiente'",id);
        if(!proof)fail(404,'Comprobante no pendiente.');
        if(input.approve){
          const data=folio(proof.stay_id);
          if(data.stay.status!=='alojado'||proof.amount_cents>data.balance||get('SELECT id FROM pms_settlements WHERE reference=?',proof.reference)||get('SELECT id FROM payment_events WHERE lower(reference)=lower(?)',proof.reference))fail(409,'El saldo cambió o la referencia ya se utilizó.');
          run("INSERT INTO pms_settlements(stay_id,amount_cents,method,reference,actor_id) VALUES(?,?,'qr',?,?)",proof.stay_id,proof.amount_cents,proof.reference,actor.id);
        }
        run('UPDATE pms_stay_proofs SET status=?,reviewed_by=? WHERE id=?',input.approve?'aceptado':'rechazado',actor.id,id);
        audit(actor,'stay_proof_review',id);return {id,status:input.approve?'aceptado':'rechazado'};
      });
    },
    review(actor,id,input) {
      requireRole(actor,finance);
      if(typeof input.approve!=='boolean') fail(400,'Indica aprobación o rechazo.');
      return transaction(db,()=>{
        const proof=get("SELECT * FROM pms_proofs WHERE id=? AND status='pendiente'",id);
        if(!proof) fail(404,'Comprobante no pendiente.');
        if(input.approve) {
          const payment=get("SELECT * FROM payments WHERE id=? AND status='pendiente'",proof.payment_id);
          if(!payment||get('SELECT id FROM payment_events WHERE lower(reference)=lower(?)',proof.reference)||get('SELECT id FROM pms_settlements WHERE reference=?',proof.reference)) fail(409,'Pago ya procesado o referencia duplicada.');
          run("INSERT INTO payment_events(payment_id,actor_id,status,reference) VALUES(?,?,'cobrada',?)",payment.id,actor.id,proof.reference);
          run("UPDATE payments SET status='cobrada' WHERE id=?",payment.id);
        }
        run('UPDATE pms_proofs SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?',input.approve?'aceptado':'rechazado',actor.id,id);
        audit(actor,'proof_review',id);return {id,status:input.approve?'aceptado':'rechazado'};
      });
    },
    task(actor,id,input) {
      requireRole(actor,[...reception,'housekeeping','maintenance']);
      return transaction(db,()=>{
        const task=get('SELECT * FROM pms_tasks WHERE id=?',id);
        if(!task) fail(404,'Tarea no encontrada.');
        if(actor.role==='housekeeping'&&task.kind!=='limpieza'||actor.role==='maintenance'&&task.kind!=='mantenimiento') fail(403,'Tarea de otra área.');
        const next={pendiente:'en_proceso',en_proceso:'finalizada'}[task.status];
        if(!next||input.status!==next) fail(409,'Transición no permitida.');
        run('UPDATE pms_tasks SET status=? WHERE id=?',next,id);
        if(next==='finalizada') run("UPDATE pms_rooms SET condition='lista' WHERE id=? AND condition=?",task.room_id,task.kind);
        audit(actor,'task_update',id);return {id,status:next};
      });
    },
    product(actor,input) {
      requireRole(actor,['admin','manager']);
      const name=text(input.name,80),category=text(input.category,50),price=number(input.priceCents,1,100000000);
      if(get('SELECT id FROM pms_catalog WHERE name=?',name)) fail(409,'Servicio ya existe.');
      return get('INSERT INTO pms_catalog(name,category,price_cents) VALUES(?,?,?) RETURNING *',name,category,price);
    }
  };
}
