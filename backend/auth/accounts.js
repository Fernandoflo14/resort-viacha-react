import { HttpError } from '../shared/http.js';
import { hashPassword, checkPassword } from './passwords.js';
import { credentials, legacyEmail, profile } from './validation.js';

export function accounts(users, jwt) {
  const authResponse = (user) => ({ success: true, user, token: jwt.issue(user.id) });
  const attempts = new Map();
  let activePasswords = 0;

  function throttle(email) {
    const now = Date.now();
    for (const [key, entry] of attempts) {
      if (entry.until <= now) attempts.delete(key);
    }
    const entry = attempts.get(email) || { count: 0, until: now + 60_000 };
    if (entry.count >= 12 || activePasswords >= 12 || (!attempts.has(email) && attempts.size >= 2000)) {
      throw new HttpError(429, 'Demasiados intentos. Espera un momento e inténtalo de nuevo.');
    }
    entry.count++;
    attempts.set(email, entry);
    activePasswords++;
  }

  return {
    async authenticate(data, register) {
      const { email, password } = credentials(data, register);
      throttle(email);
      try {
        if (register) {
          const user = users.create(email, await hashPassword(password));
          if (!user) throw new HttpError(409, 'Ese correo ya tiene una cuenta.');
          return authResponse(user);
        }
        let row = users.byEmail(email);
        if (!row) {
          const previous = legacyEmail(email);
          const candidate = previous !== email ? users.byEmail(previous) : undefined;
          if (candidate?.passwordHash.startsWith('$2')) row = candidate;
        }
        if (!(await checkPassword(password, row?.passwordHash)) || !row) {
          throw new HttpError(401, 'Correo o contraseña incorrectos.');
        }
        attempts.delete(email);
        const { passwordHash, ...user } = row;
        return authResponse(user);
      } finally {
        activePasswords--;
      }
    },
    profile(id, fields) {
      const user = fields === undefined ? users.find(id) : users.update(id, profile(fields));
      if (!user) throw new HttpError(404, 'No se encontró tu cuenta.');
      return user;
    },
  };
}
