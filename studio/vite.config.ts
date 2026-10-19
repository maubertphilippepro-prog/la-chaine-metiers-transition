import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const studio = path.dirname(fileURLToPath(import.meta.url));
const racine = path.resolve(studio, '..');

// L'interface importe noyau/, remotion/ et reglages.json hors de studio/ ; public/ fournit le jingle et le tapis.
export default defineConfig({
  root: studio,
  publicDir: path.join(racine, 'public'),
  plugins: [react()],
  server: { fs: { allow: [racine] } },
});
