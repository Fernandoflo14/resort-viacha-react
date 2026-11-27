import { body, HttpError, json } from '../../shared/http.js';

function requireRole(jwt, req, roles) {
  const { id, role } = jwt.identity(req);
  if (!roles.includes(role)) throw new HttpError(403, 'Tu cuenta no tiene acceso a esta operaci�n.');
  return id;
}

export function operationsRoutes(service, jwt, renderReport) {
  return async (req, res, path) => {
    const query = new URL(req.url, 'http://localhost').searchParams;
    const { method } = req;
    if (method === 'GET' && path === '/experiences') {
      json(res, 200, { success: true, experiences: service.catalog() });
    } else if (method === 'GET' && /^\/experiences\/[\w-]+\/slots$/.test(path)) {
      json(res, 200, { success: true, slots: service.slots(path.split('/')[2], query.get('day')) });
    } else if (path === '/experience-bookings' && ['GET', 'POST'].includes(method)) {
      const owner = jwt.owner(req);
      if (method === 'GET') {
        json(res, 200, { success: true, reservations: service.bookings(owner) });
      } else {
        const result = service.create(owner, await body(req), req.headers['idempotency-key']);
        json(res, result.replay ? 200 : 201, { success: true, reservation: result.reservation });
      }
    } else if (method === 'DELETE' && /^\/experience-bookings\/\d+$/.test(path)) {
      service.cancel(jwt.owner(req), Number(path.split('/').pop()));
      json(res, 200, { success: true });
    } else if (method === 'GET' && path === '/payments') {
      json(res, 200, { success: true, payments: service.payments(jwt.owner(req)) });
    } else if (method === 'GET' && ['/operations/history','/operations/history.pdf'].includes(path)) {
      requireRole(jwt, req, path.endsWith('.pdf') ? ['admin','manager','finance'] : ['admin', 'staff','manager','finance']);
      const result = service.history(query.get('from'), query.get('to'));
      if (path.endsWith('.pdf')) {
        res.writeHead(200, {
          'Content-Type': 'application/pdf', 'Cache-Control': 'no-store',
          'Content-Disposition': `attachment; filename="historial-${result.from}-${result.to}.pdf"`,
        });
        res.end(renderReport(result));
      } else {
        json(res, 200, { success: true, ...result });
      }
    } else if (/^\/operations\/payments\/\d+$/.test(path) && ['GET','POST'].includes(method)) {
      const actor = requireRole(jwt, req, ['admin', 'staff','manager','finance']);
      const id = Number(path.split('/').pop());
      if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(404, 'Transacci�n no encontrada.');
      if (method === 'GET') {
        json(res, 200, { success: true, events: service.events(id) });
      } else {
        const input = await body(req);
        if(input.action==='reembolsar') requireRole(jwt, req, ['admin','manager','finance']);
        json(res, 200, { success: true, payment: service.settle(id, actor, input) });
      }
    } else {
      return false;
    }
    return true;
  };
}

