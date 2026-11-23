import { openDatabase } from '../shared/database.js';
import { api, body, json } from '../shared/http.js';
import { tokens } from '../shared/token.js';
import * as passwords from './infrastructure/passwords.js';
import { accounts } from './application/accounts.js';
import { userRepository } from './infrastructure/repository.js';
import { authSchema } from './infrastructure/schema.js';
import { spec } from './presentation/spec.js';

export function authService({ path, secret, adminIds = process.env.ADMIN_USER_IDS, staffIds = process.env.STAFF_USER_IDS }) {
  const jwt = tokens(secret);
  const db = openDatabase(path, authSchema);
  const service = accounts(userRepository(db), passwords);
  const parse = value => new Set((value || '').split(',').map(id => Number(id.trim())).filter(id => Number.isSafeInteger(id) && id > 0));
  const admins = parse(adminIds);
  const staff = parse(staffIds);
  const roleFor = id => admins.has(id) ? 'admin' : staff.has(id) ? 'staff' : 'guest';

  async function route(req, res, path) {
    if (req.method === 'POST' && (path === '/register' || path === '/login')) {
      const register = path === '/register';
      const user = await service.authenticate(await body(req), register);
      const role = register ? 'guest' : roleFor(user.id);
      json(res, register ? 201 : 200, { success: true, token: jwt.issue(user.id, role), user: { ...user, role } });
      return true;
    }
    if (path === '/profile' && (req.method === 'GET' || req.method === 'PUT')) {
      const { id, role } = jwt.identity(req);
      const fields = req.method === 'PUT' ? await body(req) : undefined;
      json(res, 200, { success: true, user: { ...service.profile(id, fields), role } });
      return true;
    }
    return false;
  }
  return api({ db, route, spec, prefix: '/api/auth' });
}
