import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const options = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const dummySalt = Buffer.alloc(16);
const dummyHash = Buffer.alloc(64);

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const digest = await derive(password, salt, 64, options);
  return `scrypt-v1:${salt.toString('hex')}:${digest.toString('hex')}`;
}

export async function checkPassword(password, hash) {
  if (hash?.startsWith('$2')) {
    const { default: bcrypt } = await import('bcryptjs');
    return bcrypt.compare(password, hash);
  }
  const match = /^scrypt-v1:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(hash || '');
  const salt = match ? Buffer.from(match[1], 'hex') : dummySalt;
  const expected = match ? Buffer.from(match[2], 'hex') : dummyHash;
  const digest = await derive(password, salt, 64, options);
  return timingSafeEqual(digest, expected) && Boolean(match);
}
