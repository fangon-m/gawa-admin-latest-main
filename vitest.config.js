import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./client/src/test/setup.js'],
    include: ['client/src/**/*.test.{jsx,js}'],
    css: false,
    pool: 'forks',
  },
});
