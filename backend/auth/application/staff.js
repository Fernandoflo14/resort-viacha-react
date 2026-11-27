import { ApplicationError } from '../../shared/application-error.js';
import { credentials } from '../domain/validation.js';
import { transaction } from '../../shared/database.js';

export const staffRoles = ['admin', 'staff', 'manager', 'housekeeping', 'maintenance', 'services', 'finance'];
const reject = (status, message) => { throw new ApplicationError(status, message); };

// Additive migration: no user IDs, credentials or profiles are replaced.
export function staffDirectory(db, passwords, admins, staff) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS staff_members (
      user_id INTEGER PRIMARY KEY REFERENCES users(id),
      role TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
      department TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS staff_audit (
      id INTEGER PRIMARY KEY, actor_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
      action TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  transaction(db, () => {
    const seed = db.prepare('INSERT OR IGNORE INTO staff_members(user_id,role) SELECT id,? FROM users WHERE id=?');
    for (const id of admins) seed.run('admin', id);
    for (const id of staff) seed.run('staff', id);
  });
  const current = id => db.prepare('SELECT role,active FROM staff_members WHERE user_id=?').get(id);
  const directory = () => db.prepare(`SELECT u.id,u.email,u.name,s.role,s.active,s.department
    FROM staff_members s JOIN users u ON u.id=s.user_id ORDER BY u.name,u.id`).all();
  const audit = (actor,id,action) => db.prepare('INSERT INTO staff_audit(actor_id,user_id,action) VALUES(?,?,?)').run(actor,id,action);
  const roleFor = id => current(id)?.role || 'guest';
  const active = id => current(id)?.active !== 0;
  function requireAdmin(identity) {
    if (!active(identity.id) || roleFor(identity.id) !== 'admin' || identity.role !== 'admin') reject(403, 'No tienes permiso de administraci�n.');
  }
  function fields(input) {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const department = typeof input.department === 'string' ? input.department.trim() : '';
    if (!name || name.length > 60 || department.length > 80 || !staffRoles.includes(input.role)) reject(400, 'Completa nombre, departamento y rol v�lidos.');
    return { name, department, role: input.role };
  }
  return {
    roleFor, active, requireAdmin,
    list(identity) { requireAdmin(identity); return directory(); },
    customers(identity) {
      if (!active(identity.id) || !['admin','staff','manager','finance'].includes(roleFor(identity.id))) reject(403, 'No tienes permiso.');
      return db.prepare('SELECT u.id,u.name,u.email FROM users u LEFT JOIN staff_members s ON s.user_id=u.id WHERE s.user_id IS NULL ORDER BY u.name,u.id LIMIT 500').all();
    },
    async create(identity,input) {
      requireAdmin(identity);
      const { email,password } = credentials(input,true);
      const { name,department,role } = fields(input);
      const hash = await passwords.hashPassword(password);
      requireAdmin(identity);
      return transaction(db, () => {
        if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) reject(409, 'El correo ya est� registrado.');
        const user = db.prepare('INSERT INTO users(email,password_hash,name) VALUES(?,?,?) RETURNING id').get(email,hash,name);
        db.prepare('INSERT INTO staff_members(user_id,role,department) VALUES(?,?,?)').run(user.id,role,department);
        audit(identity.id,user.id,'create');
        return directory().find(row => row.id === user.id);
      });
    },
    update(identity,id,input) {
      requireAdmin(identity);
      if (identity.id === id) reject(409, 'No puedes cambiar tu propio rol o estado.');
      const { name,department,role } = fields(input);
      if (typeof input.active !== 'boolean') reject(400, 'Indica si la cuenta est� activa.');
      return transaction(db, () => {
        if (!current(id)) reject(404, 'Empleado no encontrado.');
        db.prepare('UPDATE users SET name=? WHERE id=?').run(name,id);
        db.prepare('UPDATE staff_members SET role=?,department=?,active=? WHERE user_id=?').run(role,department,Number(input.active),id);
        audit(identity.id,id,'update');
        return directory().find(row => row.id === id);
      });
    },
  };
}
