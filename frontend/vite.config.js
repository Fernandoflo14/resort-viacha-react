import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('./', import.meta.url)),
  build: { assetsDir: 'bundles' },
  server: {
    proxy: {
      '/api/auth': process.env.AUTH_URL || 'http://127.0.0.1:3001',
      '/api/booking': process.env.RESERVATIONS_URL || 'http://127.0.0.1:3002',
    },
  },
});
