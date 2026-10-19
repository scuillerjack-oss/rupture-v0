// Version réelle du jeu, injectée au build depuis package.json
// (vite.config.js : define __APP_VERSION__). Bug V6 : le menu affichait
// « V5 » en dur. Sous Node (tests) ou dans un aperçu sans define : 'dev'.
/* global __APP_VERSION__ */
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

export function versionLabel(version = APP_VERSION, env = 'beta') {
  const v = version === 'dev' ? 'dev' : `V${version}`;
  return env === 'commercial' ? v : `${v} — bêta`;
}
