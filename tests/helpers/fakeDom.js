// Faux DOM minimal pour tester le rendu incrémental de l'interface sous Node
// (aucune dépendance : jsdom n'est pas installable dans l'environnement).
// Couvre seulement ce que src/ui/dom.js, hud.js et playScreen.js utilisent.
class ClassList {
  constructor(el) { this.el = el; }
  get list() { return this.el.className.split(/\s+/).filter(Boolean); }
  contains(c) { return this.list.includes(c); }
  add(...cs) { const l = this.list; for (const c of cs) if (!l.includes(c)) l.push(c); this.el.className = l.join(' '); }
  remove(...cs) { this.el.className = this.list.filter((c) => !cs.includes(c)).join(' '); }
  toggle(c, on) { if (on ?? !this.contains(c)) this.add(c); else this.remove(c); }
}

class Node {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this.listeners = {};
    this.className = '';
    this.style = {};
    this.dataset = {};
    this.hidden = false;
    this.disabled = false;
    this._text = '';
    this.classList = new ClassList(this);
    this.offsetWidth = 0;
  }
  get textContent() { return this.children.length ? this.children.map((c) => c.textContent).join('') : this._text; }
  set textContent(v) { this.children = []; this._text = String(v); }
  set innerHTML(v) { this.children = []; this._text = ''; this._html = String(v); }
  get innerHTML() { return this._html ?? ''; }
  setAttribute(k, v) {
    this.attributes[k] = String(v);
    if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(v);
    if (k === 'class') this.className = String(v);
    if (k === 'disabled') this.disabled = true;
  }
  getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }
  removeAttribute(k) { delete this.attributes[k]; }
  appendChild(c) { if (c.parentNode) c.remove(); c.parentNode = this; this.children.push(c); return c; }
  append(...cs) { for (const c of cs) this.appendChild(c); }
  replaceChildren(...cs) { for (const c of this.children) c.parentNode = null; this.children = []; this.append(...cs); }
  remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter((c) => c !== this); this.parentNode = null; } }
  contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  removeEventListener(t, fn) { this.listeners[t] = (this.listeners[t] || []).filter((f) => f !== fn); }
  click() {
    if (this.disabled) return;
    const event = { target: this, stopPropagation() { this.stopped = true; } };
    for (let x = this; x && !event.stopped; x = x.parentNode) for (const fn of x.listeners.click || []) fn(event);
  }
  getBoundingClientRect() { return { left: 0, top: 0, width: 10, height: 10 }; }
  querySelector() { return null; }
  closest() { return null; }
  *walk() { yield this; for (const c of this.children) yield* c.walk(); }
  findAll(pred) { return [...this.walk()].filter(pred); }
  find(pred) { return this.findAll(pred)[0] ?? null; }
  byClass(c) { return this.find((n) => n.classList.contains(c)); }
}

export function installFakeDom() {
  globalThis.document = {
    createElement: (t) => new Node(t),
    createElementNS: (_ns, t) => new Node(t),
    createTextNode: (t) => { const n = new Node('#text'); n._text = String(t); return n; },
    hidden: false
  };
  return globalThis.document;
}
