import { HttpError } from '../shared/http.js';

const avatars = new Set(['logo.png', 'piscina.jpg', 'bar.jpg', 'viaje1.jpg', 'viaje2.jpg', 'demo1.jpg'].map(name => '/assets/' + name));

export function credentials(data, register = false) {
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email)) {
    throw new HttpError(400, 'Escribe un correo electrónico válido.');
  }
  const { password } = data;
  if (typeof password !== 'string' || !password || password.length > 1024) {
    throw new HttpError(400, 'Escribe una contraseña válida.');
  }
  if (register && (password.length < 8 || password.length > 128)) {
    throw new HttpError(400, 'La contraseña debe tener entre 8 y 128 caracteres.');
  }
  return { email, password };
}

export function legacyEmail(email) {
  const [local, domain] = email.split('@');
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return local.split('+')[0].replaceAll('.', '') + '@gmail.com';
  }
  if (/^(outlook|hotmail|live|msn|icloud|me)\.(com|es|co\.uk|fr|de)$/.test(domain)) {
    return local.split('+')[0] + '@' + domain;
  }
  if (local.includes('-') && /^(yahoo|ymail|rocketmail)\.(com|es|co\.uk|fr|de)$/.test(domain)) {
    return local.split('-').slice(0, -1).join('-') + '@' + domain;
  }
  return email;
}

function image(value) {
  if (avatars.has(value)) return true;
  if (typeof value !== 'string' || value.length > 400_000) return false;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) return false;
  const bytes = Buffer.from(match[2], 'base64');
  if (match[1] === 'png') return bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  if (match[1] === 'jpeg') return bytes.subarray(0, 3).toString('hex') === 'ffd8ff';
  return bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
}

export function profile(data) {
  const fields = {};
  for (const [name, label, limit] of [['name', 'El nombre', 60], ['description', 'La descripción', 300]]) {
    if (!Object.hasOwn(data, name)) continue;
    if (typeof data[name] !== 'string' || data[name].trim().length > limit) {
      throw new HttpError(400, `${label} debe tener hasta ${limit} caracteres.`);
    }
    fields[name] = data[name].trim();
  }
  if (Object.hasOwn(data, 'profileImage')) {
    if (!image(data.profileImage)) throw new HttpError(400, 'La imagen debe ser PNG, JPG o WebP y pesar hasta 290 KB.');
    fields.profileImage = data.profileImage;
  }
  if (!Object.keys(fields).length) throw new HttpError(400, 'Envía al menos un campo del perfil.');
  return fields;
}
