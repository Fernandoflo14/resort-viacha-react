import { createServer, request } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { access } from 'node:fs/promises';
import { serveStatic } from '../backend/shared/static.js';

const directory = fileURLToPath(new URL('./dist/', import.meta.url));

export function frontendServer({
  auth = process.env.AUTH_URL || 'http://127.0.0.1:3001',
  reservations = process.env.RESERVATIONS_URL || 'http://127.0.0.1:3002',
  staticDir = directory,
} = {}) {
  const targets = { auth: new URL(auth), booking: new URL(reservations) };
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && pathname === '/health') {
        const checks = await Promise.allSettled([
          access(join(staticDir, 'index.html')),
          ...Object.values(targets).map(async (target) => {
            const response = await fetch(new URL('/health', target), { signal: AbortSignal.timeout(2000) });
            await response.body?.cancel();
            if (!response.ok) throw new Error('Backend no disponible');
          }),
        ]);
        const healthy = checks.every(({ status }) => status === 'fulfilled');
        res.writeHead(healthy ? 200 : 503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(JSON.stringify({ status: healthy ? 'ok' : 'unavailable' }));
      }
      if (pathname === '/api-docs' || pathname === '/api-docs/') {
        return res.writeHead(302, { Location: '/api/auth/api-docs' }).end();
      }
      const legacyAuth = /^\/api\/(register|login|profile)$/.test(pathname);
      const legacyBooking = /^\/api\/(availability\/[^/]+|reservations(?:\/\d+)?)$/.test(pathname);
      const scope = /^\/api\/(auth|booking)(?:\/|$)/.exec(pathname)?.[1] || (legacyAuth ? 'auth' : legacyBooking ? 'booking' : null);
      if (!scope) {
        if (pathname.startsWith('/api/')) return res.writeHead(404).end();
        res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: https://tile.openstreetmap.org; connect-src 'self' https://router.project-osrm.org; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
        return await serveStatic(req, res, staticDir, pathname);
      }
      const target = targets[scope];
      const headers = {};
      for (const name of ['authorization', 'content-type', 'content-length', 'idempotency-key']) {
        if (req.headers[name] !== undefined) headers[name] = req.headers[name];
      }
      const upstream = request({
        hostname: target.hostname, port: target.port, method: req.method, path: legacyAuth || legacyBooking ? req.url.slice(4) : req.url, headers,
        timeout: 15_000,
      }, (reply) => {
        res.writeHead(reply.statusCode, reply.headers);
        reply.on('error', () => res.destroy());
        reply.pipe(res);
      });
      upstream.on('timeout', () => upstream.destroy(new Error('Tiempo de espera')));
      upstream.on('error', () => {
        if (res.headersSent) return res.destroy();
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ success: false, message: 'El servicio no responde. Inténtalo de nuevo.' }));
      });
      req.on('error', () => upstream.destroy());
      res.on('close', () => {
        if (!res.writableFinished) upstream.destroy();
      });
      req.pipe(upstream);
    } catch {
      if (res.headersSent) return res.destroy();
      res.writeHead(400).end();
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 3000);
  frontendServer().listen(port, '0.0.0.0', () => console.log(`Resort Viacha en http://localhost:${port}`));
}
