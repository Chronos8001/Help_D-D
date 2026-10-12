import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// L'API (dossier api/) est à écrire : voir API.md.
// Pour la tester en local avec `npm run dev`, il faudra soit la servir ici
// (plugin Vite), soit lancer `vercel dev` à la place.
export default defineConfig({
  plugins: [react()],
});
