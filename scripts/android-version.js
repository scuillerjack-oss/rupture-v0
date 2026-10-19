// versionCode / versionName Android AUTOMATIQUES depuis package.json (V7, §3.D).
//
// versionName = version de package.json (ex. 7.0.0).
// versionCode = (MAJEUR*10000 + MINEUR*100 + CORRECTIF) * 1000 + numéro de build (0-999).
//   7.0.0 sans build  -> 70000000
//   7.0.0, build 42   -> 70000042
// Le numéro de build (github.run_number en CI) fait monter le versionCode à chaque bêta
// d'une même version : Android installe alors chaque APK par-dessus le précédent. Au-delà
// de 999 il est plafonné (Android accepte une réinstallation à versionCode égal) ; monter
// la version dans package.json repart de toute façon plus haut. Maximum Android : 2 100 000 000.
//
// Lu par android/app/build.gradle (variables RUPTURE_VERSION_CODE / RUPTURE_VERSION_NAME
// fournies par les workflows).
// Usage : node scripts/android-version.js [numéro de build]   -> affiche « code nom »
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function versionCodeFor(version, build = 0) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version));
  if (!m) throw new Error(`Version invalide dans package.json : ${version}`);
  const [maj, min, patch] = m.slice(1).map(Number);
  if (min > 99 || patch > 99 || maj > 99) throw new Error(`Version hors format (chaque nombre <= 99) : ${version}`);
  const n = build === null || build === undefined || build === '' ? 0 : Number(build);
  if (!Number.isInteger(n) || n < 0) throw new Error(`Numéro de build invalide : ${build}`);
  return (maj * 10000 + min * 100 + patch) * 1000 + Math.min(n, 999);
}

export function readPackageVersion(path = new URL('../package.json', import.meta.url)) {
  return JSON.parse(readFileSync(path, 'utf8')).version;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const version = readPackageVersion();
  console.log(`${versionCodeFor(version, process.argv[2])} ${version}`);
}
