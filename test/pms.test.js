import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,copyFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {reservationsSchema} from '../backend/reservations/infrastructure/schema.js';
import {installOperations} from '../backend/reservations/infrastructure/operations-schema.js';
import {installPms} from '../backend/reservations/infrastructure/pms-schema.js';
import {pms} from '../backend/reservations/application/pms.js';
import {today} from '../backend/reservations/domain/rooms.js';
import {authSchema} from '../backend/auth/infrastructure/schema.js';
import {staffDirectory} from '../backend/auth/application/staff.js';

const admin={id:4,role:'admin'};
const staff={id:5,role:'staff'};
const guest={id:10,role:'guest'};
const tomorrow=()=>new Date(Date.parse(today()+'T00:00:00Z')+86400000).toISOString().slice(0,10);

test('migración en copia, llegada, comprobante, consumos, saldo y limpieza',()=>{
  const dir=mkdtempSync(join(tmpdir(),'pms-test-'));
  const original=join(dir,'original.sqlite'),copy=join(dir,'copy.sqlite');
  let db=new DatabaseSync(original);
  db.exec(reservationsSchema);installOperations(db);
  db.prepare(`INSERT INTO reservations(user_id,room,check_in,check_out,guests,nights,total,payment_method)
    VALUES(10,'estandar',?,?,2,1,120,'qr')`).run(today(),tomorrow());
  db.close();copyFileSync(original,copy);
  db=new DatabaseSync(copy);db.exec('PRAGMA foreign_keys=ON');
  try{
    installPms(db);installPms(db);
    assert.equal(db.prepare('SELECT count(*) AS n FROM reservations').get().n,1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM pms_rooms').get().n,12);
    const service=pms(db), dashboard=service.dashboard(staff);
    assert.throws(()=>service.configurePayment(staff,{beneficiary:'Test',instructions:'Demo'}),{status:403});
    assert.equal(service.configurePayment(admin,{beneficiary:'Resort de prueba',instructions:'Verificar antes de cobrar'}).beneficiary,'Resort de prueba');
    assert.throws(()=>service.dashboard(guest),{status:403});
    const room=dashboard.rooms.find(r=>r.category==='estandar');
    assert.throws(()=>service.checkIn(guest,{reservationId:1,roomId:room.id}),{status:403});
    assert.throws(()=>service.checkIn(staff,{reservationId:1,roomId:room.id}),{status:409});
    const paymentId=db.prepare("SELECT id FROM payments WHERE booking_id=1 AND kind='habitacion'").get().id;
    const proof=service.proof(guest,{paymentId,reference:'TEST-QR-001'});
    assert.throws(()=>service.proof(guest,{paymentId,reference:'TEST-QR-002'}),{status:409});
    assert.equal(db.prepare('SELECT status FROM payments WHERE id=?').get(paymentId).status,'pendiente');
    assert.throws(()=>service.review(guest,proof.id,{approve:true}),{status:403});
    service.review(staff,proof.id,{approve:true});
    const stay=service.checkIn(staff,{reservationId:1,roomId:room.id});
    assert.equal(stay.stay.status,'alojado');
    assert.throws(()=>service.checkIn(staff,{reservationId:1,roomId:room.id}),{status:409});
    assert.equal(service.folio(guest,stay.stay.id).lodging.status,'cobrada');
    const product=dashboard.catalog.find(p=>p.name==='Desayuno');
    service.charge({id:6,role:'services'},stay.stay.id,{productId:product.id,quantity:2});
    assert.equal(service.folio(guest,stay.stay.id).balance,9000);
    assert.throws(()=>service.checkOut(staff,stay.stay.id),{status:409});
    service.settle(staff,stay.stay.id,{amountCents:4000,method:'efectivo',reference:'TEST-CASH-1'});
    assert.equal(service.folio(guest,stay.stay.id).balance,5000);
    const balanceProof=service.stayProof(guest,stay.stay.id,{reference:'STAY-QR-2'});
    assert.equal(balanceProof.amount_cents,5000);
    assert.equal(service.folio(guest,stay.stay.id).balance,5000);
    service.reviewStayProof(staff,balanceProof.id,{approve:true});
    assert.equal(service.checkOut(staff,stay.stay.id).stay.status,'finalizado');
    const task=service.dashboard({id:7,role:'housekeeping'}).tasks[0];
    service.task({id:7,role:'housekeeping'},task.id,{status:'en_proceso'});
    service.task({id:7,role:'housekeeping'},task.id,{status:'finalizada'});
    assert.equal(service.dashboard(staff).rooms.find(r=>r.id===room.id).condition,'lista');
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
    const source=new DatabaseSync(original,{readOnly:true});
    assert.equal(source.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name='pms_rooms'").get().n,0);
    source.close();
  }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});

test('roles existentes migran sin cambiar IDs y los empleados no pueden administrarse',async()=>{
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');db.exec(authSchema);
  db.prepare('INSERT INTO users(id,email,password_hash) VALUES(?,?,?)').run(4,'admin@example.test','hash');
  db.prepare('INSERT INTO users(id,email,password_hash) VALUES(?,?,?)').run(5,'staff@example.test','hash');
  const directory=staffDirectory(db,{hashPassword:async()=> 'test-hash'},new Set([4]),new Set([5]));
  assert.equal(directory.roleFor(4),'admin');assert.equal(directory.roleFor(5),'staff');
  assert.throws(()=>directory.list(staff),{status:403});
  const input={name:'Personal de limpieza',department:'Habitaciones',role:'housekeeping',email:'clean@example.test',password:'test-pass-123'};
  const employee=await directory.create(admin,input);
  assert.equal(employee.role,'housekeeping');
  directory.update(admin,employee.id,{...input,active:false});
  assert.equal(directory.active(employee.id),false);
  assert.throws(()=>directory.update(admin,4,{...input,active:false}),{status:409});
  db.close();
});
