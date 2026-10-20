import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` lets the built app run from any subpath (e.g. GitHub Pages).
export default defineConfig({
  plugins: [react()],
  base: './',
});
