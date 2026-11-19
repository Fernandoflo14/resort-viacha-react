import { listen } from '../shared/http.js';
import { authService } from './app.js';

process.umask(0o077);
const server = authService({ path: process.env.AUTH_DB || 'data/auth.sqlite', secret: process.env.JWT_SECRET });
listen(server, Number(process.env.PORT || 3001));