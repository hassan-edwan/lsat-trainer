import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import localData from './scripts/local-data-plugin.mjs';

// `base: './'` lets the built app run from any subpath (e.g. GitHub Pages).
// Fixed ports (strictPort): your browser data is tied to the address, so the app
// should never quietly move to a new port. Your progress is also saved to data/.
export default defineConfig({
  plugins: [react(), localData({ dir: fileURLToPath(new URL('./data', import.meta.url)) })],
  base: './',
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
