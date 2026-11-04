import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev proxy: injects the Worker bearer token server-side so it never lands
// in the browser bundle. Run `wrangler dev` (8787) next to `vite`.
const apiTarget = process.env.OFFICE_API_TARGET ?? 'http://127.0.0.1:8787';
const apiToken = process.env.API_TOKEN ?? 'local-dev-token';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        headers: {
          authorization: `Bearer ${apiToken}`,
        },
      },
    },
  },
});
