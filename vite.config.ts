import { defineConfig } from 'vite';

// Local declaration so the config type-checks without @types/node.
declare const process: { env: Record<string, string | undefined> };

const port = Number(process.env.PORT) || 5173;
const apiPort = Number(process.env.API_PORT) || 8787;

export default defineConfig({
  base: './',
  server: {
    port,
    open: false,
    // In production Traefik routes /api to the scoreboard container; during
    // development the dev server proxies it so both are same-origin.
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: false,
      },
    },
  },
  build: { target: 'es2022' },
});
