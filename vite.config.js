import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  server: {
    port: 3000,
    open: false,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../dist',
    // The output directory sits outside the Vite root, so Vite refuses to
    // empty it by default. Without this, every build leaves the previous
    // bundles behind — stale assets accumulate, and a bundle from before a
    // security fix (for example one that still shipped default credentials)
    // stays on disk and keeps being served.
    emptyOutDir: true,
  },
});
