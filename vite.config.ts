import { defineConfig } from 'vite';

// Lokale Deklaration, damit die Config ohne @types/node typprüft.
declare const process: { env: Record<string, string | undefined> };

const port = Number(process.env.PORT) || 5173;

export default defineConfig({
  base: './',
  server: { port, open: false },
  build: { target: 'es2022' },
});
