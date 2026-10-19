#!/usr/bin/env node
// Assemble la démo de la carte dans tools/carte/dist/ (hors ligne, avec esbuild).
// Usage : node tools/carte/build-demo.mjs [esbuild]   (par défaut : esbuild du PATH ou /opt/npm-tools)
import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT = join(HERE, 'dist');
const candidates = [process.argv[2], join(ROOT, 'node_modules/.bin/esbuild'), '/opt/npm-tools/node_modules/.bin/esbuild'].filter(Boolean);
const esbuild = candidates.find((p) => existsSync(p));
if (!esbuild) throw new Error('esbuild introuvable');
mkdirSync(OUT, { recursive: true });
execFileSync(esbuild, [join(HERE, 'demo.js'), '--bundle', '--format=esm', `--outfile=${join(OUT, 'demo-bundle.js')}`, '--log-level=warning'], {
  stdio: 'inherit'
});
copyFileSync(join(HERE, 'demo.html'), join(OUT, 'index.html'));
copyFileSync(join(ROOT, 'src/ui/worldMap.css'), join(OUT, 'worldMap.css'));
console.log(`Démo assemblée : ${OUT}/index.html`);
