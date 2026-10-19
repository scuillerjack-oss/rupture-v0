import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  // V7 : base RELATIVE. Le même build marche sur GitHub Pages
  // (/rupture-v0/), dans l'appli Android embarquée (https://localhost/) et
  // dans l'APK de bêta qui charge le site (server.url). L'ancienne base
  // absolue '/rupture-v0/' donnait un écran vide dans l'appli Android.
  base: './',
  define: {
    // Version réelle affichée dans le menu (bug V6 : « V5 » écrit en dur).
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  build: {
    target: 'es2020'
  }
});
