import { openDatabase } from '../shared/database.js';
import { api, body, json } from '../shared/http.js';
import { tokens } from '../shared/token.js';
import { accounts } from './accounts.js';
import { userRepository } from './repository.js';
import { authSchema } from './schema.js';
import { spec } from './spec.js';

export function authService({ path, secret }) {
  const jwt = tokens(secret);
  const db = openDatabase(path, authSchema);
  const service = accounts(userRepository(db), jwt);

  async function route(req, res, path) {
    if (req.method === 'POST' && (path === '/register' || path === '/login')) {
      const register = path === '/register';
      const result = await service.authenticate(await body(req), register);
      json(res, register ? 201 : 200, result);
      return true;
    }
    if (path === '/profile' && (req.method === 'GET' || req.method === 'PUT')) {
      const id = jwt.owner(req);
      const fields = req.method === 'PUT' ? await body(req) : undefined;
      json(res, 200, { success: true, user: service.profile(id, fields) });
      return true;
    }
    return false;
  }
  return api({ db, route, spec, prefix: '/api/auth' });
}
