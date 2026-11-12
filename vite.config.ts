import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const projectDir = path.dirname(fileURLToPath(import.meta.url));

// Dev proxy: injects the Worker bearer token server-side so it never lands
// in the browser bundle. Port 8788 avoids the other CRM worker on 8787.
const apiTarget = process.env.OFFICE_API_TARGET ?? 'http://127.0.0.1:8788';
const apiToken = process.env.API_TOKEN ?? 'local-dev-token';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Paksa satu salinan React/Remotion untuk player dan komposisi lokal.
    alias: [
      { find: /^remotion$/, replacement: path.resolve(projectDir, 'node_modules/remotion') },
      { find: /^react$/, replacement: path.resolve(projectDir, 'node_modules/react') },
      { find: /^react-dom$/, replacement: path.resolve(projectDir, 'node_modules/react-dom') },
    ],
  },
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
