import { defineConfig } from 'vite';

const repoBase = '/Molez-tribute/';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || (process.env.GITHUB_ACTIONS ? repoBase : '/'),
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
  },
});
