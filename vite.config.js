import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const repoBase = '/capybara/';

export default defineConfig(({ command }) => ({
  base: process.env.VITE_BASE_PATH || (command === 'build' && process.env.GITHUB_ACTIONS ? repoBase : '/'),
  server: {
    host: '0.0.0.0',
    port: 4173,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: {
        host: resolve(process.cwd(), 'index.html'),
        controller: resolve(process.cwd(), 'controller/index.html'),
      },
    },
  },
}));
