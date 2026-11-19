import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';

const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

export async function serveStatic(req, res, directory, pathname) {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const root = resolve(directory);
  const path = resolve(root, '.' + decodeURIComponent(pathname));
  if (path !== root && !path.startsWith(root + sep)) {
    res.writeHead(404).end();
    return;
  }
  const file = extname(path) && !/\/(index|precios|calendario|guia_turistica|usuario|login)\.html$/.test(pathname) ? path : resolve(root, 'index.html');
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, {
    'Content-Type': types[extname(file)] || 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': pathname.startsWith('/bundles/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  if (req.method === 'HEAD') return res.end();
  await pipeline(createReadStream(file), res);
}
