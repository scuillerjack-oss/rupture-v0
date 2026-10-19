// V7 — petit outillage DOM pour le rendu INCRÉMENTAL : les éléments sont
// créés une seule fois, puis seules leurs propriétés changent. Chaque
// setter ne touche le DOM que si la valeur a réellement changé (pas de
// travail inutile à 4 mises à jour par seconde, et un bouton n'est jamais
// remplacé pendant qu'on le touche).
export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('data-')) el.setAttribute(k, v);
    else if (k === 'on') {
      for (const [type, fn] of Object.entries(v)) el.addEventListener(type, fn);
    } else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

export function setText(el, text) {
  const value = text === null || text === undefined ? '' : String(text);
  if (el.textContent !== value) el.textContent = value;
}

export function setClass(el, name, on) {
  const has = el.classList.contains(name);
  if (on && !has) el.classList.add(name);
  else if (!on && has) el.classList.remove(name);
}

export function setHidden(el, hidden) {
  if (Boolean(el.hidden) !== Boolean(hidden)) el.hidden = Boolean(hidden);
}

export function setDisabled(el, disabled) {
  if (Boolean(el.disabled) !== Boolean(disabled)) el.disabled = Boolean(disabled);
}

export function setAttr(el, name, value) {
  const v = value === null || value === undefined ? null : String(value);
  if (el.getAttribute(name) !== v) {
    if (v === null) el.removeAttribute(name);
    else el.setAttribute(name, v);
  }
}

export function setStyle(el, prop, value) {
  if (el.style[prop] !== value) el.style[prop] = value;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
