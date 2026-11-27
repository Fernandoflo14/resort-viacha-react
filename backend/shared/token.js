import { createHmac, timingSafeEqual } from 'node:crypto';
import { HttpError } from './http.js';

const encode = (payload) => Buffer.from(JSON.stringify(payload)).toString('base64url');
const header = encode({ alg: 'HS256', typ: 'JWT' });
const now = () => Math.floor(Date.now() / 1000);

export function tokens(secret) {
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error('Configura JWT_SECRET con una clave aleatoria de al menos 32 bytes.');
  }
  const sign = (data) => createHmac('sha256', secret).update(data).digest();
  return {
    issue(id, role = 'guest') {
      const iat = now();
      const input = header + '.' + encode({
        iss: 'resort-viacha-auth', aud: 'resort-viacha', sub: String(id), iat, exp: iat + 7200, role,
      });
      return input + '.' + sign(input).toString('base64url');
    },
    identity(req) {
      const match = /^Bearer ([\w-]+)\.([\w-]+)\.([\w-]+)$/i.exec(req.headers.authorization || '');
      const denied = new HttpError(401, 'Inicia sesi�n o vuelve a ingresar si tu sesi�n expir�.');
      if (!match || match[1] !== header || match[2].length > 1024 || match[3].length !== 43) throw denied;
      const signature = Buffer.from(match[3], 'base64url');
      if (signature.length !== 32 || !timingSafeEqual(signature, sign(match[1] + '.' + match[2]))) throw denied;
      let claims;
      try {
        claims = JSON.parse(Buffer.from(match[2], 'base64url').toString('utf8'));
      } catch {
        throw denied;
      }
      const id = Number(claims?.sub);
      if (!Number.isSafeInteger(id) || id < 1 || claims.sub !== String(id) ||
          claims.iss !== 'resort-viacha-auth' || claims.aud !== 'resort-viacha' ||
          !Number.isSafeInteger(claims.exp) || claims.exp <= now()) throw denied;
      const role = ['admin', 'staff', 'manager', 'housekeeping', 'maintenance', 'services', 'finance'].includes(claims.role) ? claims.role : 'guest';
      return { id, role };
    },
    owner(req) {
      return this.identity(req).id;
    },
  };
}

