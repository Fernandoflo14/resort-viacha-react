import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { ApplicationError } from './application-error.js';

export const HttpError = ApplicationError;

export function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

export async function body(req) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new HttpError(415, 'Envía los datos en JSON.');
  }
  const limit = 450_000;
  let size = 0;
  const chunks = [];
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > limit) {
      req.resume();
      throw new HttpError(413, 'El archivo o los datos son demasiado grandes.');
    }
    chunks.push(chunk);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  throw new HttpError(400, 'El cuerpo debe ser un objeto JSON válido.');
}

const swaggerAssets = {
  '/api-docs/swagger-ui.css': ['swagger-ui.css', 'text/css; charset=utf-8'],
  '/api-docs/swagger-ui-bundle.js': ['swagger-ui-bundle.js', 'text/javascript; charset=utf-8'],
};

function docs(res, prefix) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Swagger | Resort Viacha</title>
<link rel="stylesheet" href="${prefix}/api-docs/swagger-ui.css"></head>
<body><div id="swagger-ui"></div><script src="${prefix}/api-docs/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({url:${JSON.stringify(prefix + '/openapi.json')},dom_id:'#swagger-ui',validatorUrl:null});</script>
<noscript>Activa JavaScript para usar Swagger UI.</noscript></body></html>`);
}

export function api({ db, route, spec, prefix }) {
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      const externalPath = pathname.startsWith(prefix + '/');
      const path = externalPath ? pathname.slice(prefix.length) : pathname;
      if (req.method === 'GET') {
        if (path === '/health') {
          db.prepare('SELECT 1').get();
          return json(res, 200, { status: 'ok' });
        }
        if (path === '/openapi.json') {
          return json(res, 200, { ...spec, servers: [{ url: externalPath ? prefix : '/' }] });
        }
        if (path === '/api-docs' || path === '/api-docs/') return docs(res, externalPath ? prefix : '');
        if (Object.hasOwn(swaggerAssets, path)) {
          const [file, type] = swaggerAssets[path];
          const data = await readFile(new URL('../../node_modules/swagger-ui-dist/' + file, import.meta.url));
          res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400' });
          return res.end(data);
        }
      }
      if (await route(req, res, path)) return;
      throw new HttpError(404, 'Ruta no encontrada.');
    } catch (error) {
      if (res.destroyed) return;
      if (!(error instanceof HttpError)) console.error(error);
      const status = error instanceof HttpError ? error.status : 500;
      json(res, status, { success: false, message: status === 500 ? 'No se pudo completar la operación.' : error.message });
    }
  });
  server.on('close', () => db.close());
  return server;
}

export function listen(server, port) {
  server.listen(port, process.env.HOST || '0.0.0.0', () => console.log(`API en el puerto ${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => server.close());
  }
}
