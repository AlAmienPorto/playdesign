import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev proxy: injects the Worker bearer token server-side so it never lands
// in the browser bundle. Run `wrangler dev` (8787) next to `vite`.
const apiTarget = process.env.OFFICE_API_TARGET ?? 'http://127.0.0.1:8787';
const apiToken = process.env.API_TOKEN ?? 'local-dev-token';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Komposisi Remotion dipakai bersama oleh preview (player) dan renderer:
    // satu implementasi, bukan salinan. Alias remotion/react memaksa satu
    // salinan saja karena proyek Remotion punya node_modules sendiri.
    alias: [
      { find: '@story', replacement: path.resolve(__dirname, '../remotion-starter/src/Story.tsx') },
      { find: /^remotion$/, replacement: path.resolve(__dirname, 'node_modules/remotion') },
      { find: /^react$/, replacement: path.resolve(__dirname, 'node_modules/react') },
      { find: /^react-dom$/, replacement: path.resolve(__dirname, 'node_modules/react-dom') },
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
