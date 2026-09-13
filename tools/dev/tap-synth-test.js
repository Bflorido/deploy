/**
 * Prueba del sintetizador de tap sin navegador.
 * Extrae la función REAL initGlobalTapToClick() de js/console.js y la ejecuta
 * contra un DOM mínimo instrumentado, para verificar la deduplicación en los dos
 * comportamientos de navegador que nos han dado problemas:
 *   - Android Chrome: emite click nativo (el bug hacía que la síntesis se
 *     bloquease a sí misma y el botón no hiciera nada).
 *   - iOS/WebKit: no emite click nativo (debe actuar la síntesis, y si el
 *     navegador no entrega el evento, la vía de respaldo).
 *
 * Uso: node tools/dev/tap-synth-test.js
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'console.js'), 'utf8');

// --- Extraer la función real por conteo de llaves ---
const start = src.indexOf('function initGlobalTapToClick()');
if (start < 0) { console.log('FATAL: no se encontró initGlobalTapToClick'); process.exit(1); }
let depth = 0, end = -1, started = false;
for (let i = start; i < src.length; i++) {
  const c = src[i];
  if (c === '{') { depth++; started = true; }
  else if (c === '}') { depth--; if (started && depth === 0) { end = i + 1; break; } }
}
const fnSrc = src.slice(start, end);
console.log('función extraída: ' + fnSrc.length + ' caracteres\n');

// --- DOM mínimo ---
function makeEl(name, attrs, classes) {
  const el = {
    _name: name, _attrs: attrs || {}, _classes: classes || [],
    _listeners: [], _clicks: 0,
    onclick: null, ondblclick: null,
    dispatchEvent(ev) {
      this._delivered = (this._delivered || 0) + 1;
      if (ev.type === 'click') {
        this._clicks++;
        // El navegador "entrega" el click: recorre el árbol en burbuja
        let n = this;
        while (n) {
          (n._listeners || []).forEach(function (l) {
            if (l.type === 'click' && (!l.capture || n === this)) { /* capture aparte */ }
          });
          n._bubbled = true;
          n = n._parent || null;
        }
      }
    },
    addEventListener(type, fn, opts) { this._listeners.push({ type: type, fn: fn, capture: !!(opts && opts.capture) }); },
    removeEventListener() {},
    getAttribute(k) { return (k in this._attrs) ? this._attrs[k] : null; },
    closest(sel) {
      let n = this;
      while (n) {
        if (matchesSel(n, sel)) return n;
        n = n._parent || null;
      }
      return null;
    },
    classList: { contains(c) { return this._classes ? this._classes.indexOf(c) >= 0 : false; } }
  };
  return el;
}
function matchesSel(el, sel) {
  const parts = sel.split(',').map(function (s) { return s.trim(); });
  for (const p of parts) {
    if (p === 'button' || p === 'a') { if (el._name === p) return true; }
    else if (p[0] === '.') { if (el._classes && el._classes.indexOf(p.slice(1)) >= 0) return true; }
    else if (p[0] === '[') {
      const attr = p.slice(1, -1).split('=')[0];
      if (el._attrs && (attr in el._attrs)) return true;
      if (attr === 'onclick' && el.onclick) return true;
      if (attr === 'ondblclick' && el.ondblclick) return true;
    }
  }
  return false;
}

// --- Entorno global que espera la función ---
const documentListeners = [];
const doc = {
  addEventListener(type, fn, opts) { documentListeners.push({ type: type, fn: fn, capture: !!(opts && opts.capture) }); }
};
function fireDoc(type, ev) {
  documentListeners.filter(function (l) { return l.type === type; }).forEach(function (l) { l.fn(ev); });
}
function fireDocCapture(type, ev) {
  documentListeners.filter(function (l) { return l.type === type && l.capture; }).forEach(function (l) { l.fn(ev); });
}

const sandbox = {
  document: doc,
  isTouch: true,
  navigator: { maxTouchPoints: 5 },
  window: { innerWidth: 400 },
  MouseEvent: function (type, init) { return Object.assign({ type: type, defaultPrevented: false }, init || {}); },
  Date: Date, Math: Math, console: console,
  loadUrl: null
};
sandbox.window.document = doc;

const factory = new Function(
  'document', 'isTouch', 'navigator', 'window', 'MouseEvent', 'loadUrl',
  fnSrc + '\n; return initGlobalTapToClick;'
);

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
}
function tapEvent(target, x, y) {
  return { target: target, cancelable: true, defaultPrevented: false,
    changedTouches: [{ clientX: x === undefined ? 50 : x, clientY: y === undefined ? 50 : y }] };
}

// ============ ESCENARIO 1: navegador que SÍ emite click nativo (Android) ============
console.log('=== Escenario 1: Android (emite click nativo ANTES que la síntesis) ===');
{
  documentListeners.length = 0;
  const init = factory(doc, true, sandbox.navigator, sandbox.window, sandbox.MouseEvent, null);
  init();
  const btn = makeEl('button', { onclick: 'window.__hits = (window.__hits||0)+1' }, []);
  const global = {};
  sandbox.window.__hits = 0;
  // El navegador emite su click nativo (fuera de la síntesis)
  fireDocCapture('click', { type: 'click', target: btn });
  btn.dispatchEvent({ type: 'click' });
  // Ahora el usuario toca
  fireDocCapture('touchstart', { touches: [{ clientX: 50, clientY: 50 }], cancelable: true, defaultPrevented: false });
  fireDocCapture('touchend', tapEvent(btn));
  check('el click nativo llegó al botón', btn._clicks >= 1 || btn._delivered >= 1, { delivered: btn._delivered });
  check('NO se duplica la acción (síntesis suprimida)', btn._delivered === 1, { delivered: btn._delivered });
}

// ============ ESCENARIO 2: navegador que NO emite click nativo (iOS) ============
console.log('\n=== Escenario 2: iOS (sin click nativo) -> debe sintetizar ===');
{
  documentListeners.length = 0;
  const init = factory(doc, true, sandbox.navigator, sandbox.window, sandbox.MouseEvent, null);
  init();
  const btn = makeEl('button', { onclick: 'x' }, []);
  fireDocCapture('touchstart', { touches: [{ clientX: 50, clientY: 50 }], cancelable: true, defaultPrevented: false });
  fireDocCapture('touchend', tapEvent(btn));
  check('se sintetizó el click (llegó al botón)', btn._delivered >= 1, { delivered: btn._delivered });
}

// ============ ESCENARIO 3: ni click nativo ni entrega del sintético -> vía 2 ============
console.log('\n=== Escenario 3: el navegador no entrega el click -> vía de respaldo ===');
{
  documentListeners.length = 0;
  let fallbackRan = false;
  const win = { innerWidth: 400 };
  const init = factory(doc, true, sandbox.navigator, win, sandbox.MouseEvent, null);
  init();
  const btn = makeEl('button', {}, []);
  // El atributo sólo puede ejecutarse por la vía 2 (new Function)
  btn._attrs.ondblclick = 'FALLBACK_FLAG = true';
  const g = new Function('FALLBACK_FLAG', 'return function(){ }');
  // Stub para observar la ejecución del atributo
  const origFunction = global.Function;
  let executed = null;
  global.Function = function (a, b) {
    if (a === 'event' && b === 'FALLBACK_FLAG = true') { executed = b; return function () { fallbackRan = true; }; }
    return origFunction.apply(null, arguments);
  };
  try {
    fireDocCapture('touchstart', { touches: [{ clientX: 50, clientY: 50 }], cancelable: true, defaultPrevented: false });
    fireDocCapture('touchend', tapEvent(btn));
  } finally {
    global.Function = origFunction;
  }
  check('la vía de respaldo ejecutó el handler del atributo', fallbackRan === true, { fallbackRan: fallbackRan });
}

// ============ ESCENARIO 4: gestos que NO deben disparar ============
console.log('\n=== Escenario 4: gestos que deben ignorarse ===');
{
  documentListeners.length = 0;
  const init = factory(doc, true, sandbox.navigator, sandbox.window, sandbox.MouseEvent, null);
  init();

  const b1 = makeEl('button', { onclick: 'x' }, []);
  fireDocCapture('touchstart', { touches: [{ clientX: 50, clientY: 50 }], cancelable: true, defaultPrevented: false });
  fireDocCapture('touchend', { target: b1, cancelable: true, defaultPrevented: false, changedTouches: [{ clientX: 120, clientY: 60 }] });
  check('un arrastre de 70 px (scroll) no dispara', b1._delivered === undefined, { delivered: b1._delivered });

  const b2 = makeEl('button', { onclick: 'x' }, []);
  fireDocCapture('touchstart', { touches: [{ clientX: 50, clientY: 50 }], cancelable: true, defaultPrevented: false });
  fireDocCapture('touchend', { target: b2, cancelable: false, defaultPrevented: false, changedTouches: [{ clientX: 50, clientY: 50 }] });
  check('gesto cancelado por el navegador no dispara', b2._delivered === undefined, { delivered: b2._delivered });

  const inp = makeEl('input', {}, []);
  fireDocCapture('touchstart', { touches: [{ clientX: 50, clientY: 50 }], cancelable: true, defaultPrevented: false });
  fireDocCapture('touchend', tapEvent(inp));
  check('un campo de texto no recibe click sintético', inp._delivered === undefined, { delivered: inp._delivered });

  const b3 = makeEl('button', { onclick: 'x' }, []);
  fireDocCapture('touchstart', { touches: [{ clientX: 50, clientY: 50 }], cancelable: true, defaultPrevented: true });
  fireDocCapture('touchend', { target: b3, cancelable: true, defaultPrevented: true, changedTouches: [{ clientX: 50, clientY: 50 }] });
  check('gesto ya gestionado (preventDefault) no se duplica', b3._delivered === undefined, { delivered: b3._delivered });
}

console.log('\n=== RESULTADO: ' + pass + ' OK, ' + fail + ' fallos ===');
process.exit(fail ? 1 : 0);
