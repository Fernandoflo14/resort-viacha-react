import { listen } from '../shared/http.js';
import { reservationsService } from './app.js';

process.umask(0o077);
const server = reservationsService({ path: process.env.RESERVATIONS_DB || 'data/reservas.sqlite', secret: process.env.JWT_SECRET });
listen(server, Number(process.env.PORT || 3002));