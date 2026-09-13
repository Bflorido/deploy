/**
 * Reproduce el flujo REAL de un tap sobre los elementos del escritorio, tal como
 * funcionaba cuando "sí abría". Registra las ejecuciones reales de los handlers
 * por las DOS vías posibles:
 *   - evento click despachado (síntesis)  -> dispatchEvent del simulado
 *   - ejecución directa del atributo      -> new Function (vía de respaldo)
 *
 * Uso: node tools/dev/tap-icon-flow-test.js
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'console.js'), 'utf8');
const start = src.indexOf('function initGlobalTapToClick()');
let depth = 0, end = -1, started = false;
for (let i = start; i < src.length; i++) {
  const c = src[i];
  if (c === '{') { depth++; started = true; }
  else if (c === '}') { depth--; if (started && depth === 0) { end = i + 1; break; } }
}
const fnSrc = src.slice(start, end);

/** Registro único de ejecuciones de handler (las dos vías escriben aquí). */
let EXEC = [];
const origFunction = global.Function;
global.Function = function (a, b) {
  // La vía de respaldo compila el atributo: new Function('event', "<código>")
  if ((a === 'event' || a === undefined) && typeof b === 'string') {
    return function () { EXEC.push(b); };
  }
  return origFunction.apply(null, arguments);
};

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
}

function makeEnv() {
  const docListeners = [];
  const doc = { addEventListener(t, f, o) { docListeners.push({ t: t, f: f, c: !!(o && o.capture) }); } };

  function mk(attrs, classes, name) {
    return {
      _name: name || 'div', _attrs: attrs || {}, _classes: classes || [], _parent: doc,
      _listeners: [], _clicks: 0,
      addEventListener(t, f) { this._listeners.push({ t: t, f: f }); },
      removeEventListener() {},
      getAttribute(k) { return (k in this._attrs) ? this._attrs[k] : null; },
      dispatchEvent(ev) {
        // Entrega real: recorre el elemento y sus ancestros ejecutando los
        // handlers inline del tipo de evento, como el navegador.
        let n = this;
        while (n && n !== doc) {
          (n._listeners || []).forEach(function (l) { if (l.t === ev.type) l.f(ev); });
          if (ev.type === 'click' && n._attrs.onclick) EXEC.push(n._attrs.onclick);
          if (ev.type === 'dblclick' && n._attrs.ondblclick) EXEC.push(n._attrs.ondblclick);
          n = n._parent || null;
        }
        this._clicks++;
        ev._delivered = true;
        return true;
      },
      closest(sel) {
        let n = this;
        while (n && n !== doc) {
          const parts = String(sel).split(',').map(function (s) { return s.trim(); });
          for (const p of parts) {
            if (!p) continue;
            if (p === 'button' || p === 'a' || p === 'input' || p === 'select' || p === 'textarea') {
              if (n._name === p) return n;
            } else if (p[0] === '.') {
              const cls = p.slice(1).split(/[\s\[]/)[0];
              if (n._classes.indexOf(cls) >= 0) return n;
            } else if (p[0] === '[') {
              const a = p.slice(1).split('=')[0].replace(/\]$/, '');
              if (a in n._attrs) return n;
            }
          }
          n = n._parent || null;
        }
        return null;
      },
      getBoundingClientRect() { return { left: 0, top: 0, width: 80, height: 80 }; }
    };
  }

  const f = new origFunction('document', 'isTouch', 'navigator', 'window', 'MouseEvent', 'loadUrl',
    fnSrc + '\n; return initGlobalTapToClick;');
  const win = {
    innerWidth: 400,
    // rAF inmediato: la prueba es síncrona
    requestAnimationFrame: function (fn) { fn(); return 1; }
  };
  const init = f(doc, true, { maxTouchPoints: 5 }, win,
    function (type, o) { return Object.assign({ type: type, defaultPrevented: false, cancelable: true }, o || {}); },
    function () { EXEC.push('loadUrl'); });
  init();

  function fireDoc(type, ev, cap) {
    docListeners.filter(function (l) { return l.t === type && (!cap || l.c); }).forEach(function (l) { l.f(ev); });
  }
  function tap(el, x, y) {
    fireDoc('touchstart', { touches: [{ clientX: 40, clientY: 40 }], cancelable: true, defaultPrevented: false }, true);
    fireDoc('touchend', {
      target: el, cancelable: true, defaultPrevented: false,
      changedTouches: [{ clientX: x === undefined ? 40 : x, clientY: y === undefined ? 40 : y }]
    }, true);
  }
  /** Click nativo como el que emite Chrome Android (pasa por el árbol completo) */
  function nativeClick(el) {
    fireDoc('click', { type: 'click', target: el, defaultPrevented: false }, true);
    el.dispatchEvent({ type: 'click', target: el });
  }
  return { mk: mk, tap: tap, fireDoc: fireDoc, nativeClick: nativeClick };
}

function reset() { EXEC = []; }
function count(code) { return EXEC.filter(function (x) { return x === code; }).length; }

// ===== A. Iconos (ondblclick): iOS, sin click nativo =====
console.log('=== A. Icono .dicon (ondblclick), iOS sin click nativo ===');
{
  reset();
  const env = makeEnv();
  const icon = env.mk({ ondblclick: "openWindow('win-memes')" }, ['dicon']);
  env.tap(icon);
  check('abre la app', count("openWindow('win-memes')") === 1, EXEC);
}

// ===== B. Iconos (ondblclick): Android, con click nativo previo =====
console.log('\n=== B. Icono .dicon (ondblclick), Android con click nativo ===');
{
  reset();
  const env = makeEnv();
  const icon = env.mk({ ondblclick: "openWindow('win-memes')" }, ['dicon']);
  env.nativeClick(icon);            // Android entrega su click
  const trasNativo = count("openWindow('win-memes')");
  env.tap(icon);
  check('el click nativo no abre por sí solo (correcto)', trasNativo === 0, EXEC);
  check('el tap abre la app', count("openWindow('win-memes')") === 1, EXEC);
}

// ===== C. Dos apps distintas seguidas =====
console.log('\n=== C. Dos taps seguidos en apps distintas ===');
{
  reset();
  const env = makeEnv();
  const a = env.mk({ ondblclick: "openWindow('win-memes')" }, ['dicon']);
  const b = env.mk({ ondblclick: 'openNaves()' }, ['dicon']);
  env.tap(a);
  env.tap(b);
  check('el primero abre Memes', count("openWindow('win-memes')") === 1, EXEC);
  check('el segundo abre Ships (no se bloquea)', count('openNaves()') === 1, EXEC);
}

// ===== D. Botón de ventana con onclick: iOS =====
console.log('\n=== D. Botón con onclick, iOS sin click nativo ===');
{
  reset();
  const env = makeEnv();
  const btn = env.mk({ onclick: "openWindow('win-games')" }, [], 'button');
  env.tap(btn);
  check('ejecuta el onclick una vez', count("openWindow('win-games')") === 1, EXEC);
}

// ===== E. Botón con onclick: Android, click nativo después del tap =====
console.log('\n=== E. Botón con onclick, Android (click nativo tras el tap) ===');
{
  reset();
  const env = makeEnv();
  const btn = env.mk({ onclick: "openWindow('win-games')" }, [], 'button');
  env.tap(btn);                      // el tap sintetiza el click
  env.nativeClick(btn);              // Android entrega después el suyo
  console.log('    ejecuciones: ' + JSON.stringify(EXEC));
  check('ejecuta el onclick (al menos una vez)', count("openWindow('win-games')") >= 1, EXEC);
}

// ===== F. ✕ dentro de un contenedor con ondblclick =====
console.log('\n=== F. Botón ✕ dentro de un contenedor con ondblclick ===');
{
  reset();
  const env = makeEnv();
  const cont = env.mk({ ondblclick: "openWindow('win-memes')" }, ['dicon']);
  const closeBtn = env.mk({ onclick: "closeWindow('win-memes')" }, [], 'button');
  closeBtn._parent = cont;
  env.tap(closeBtn);
  check('ejecuta el onclick del botón', count("closeWindow('win-memes')") === 1, EXEC);
  check('NO ejecuta el ondblclick del contenedor', count("openWindow('win-memes')") === 0, EXEC);
}

// ===== G. Gestos que no deben disparar =====
console.log('\n=== G. Gestos que no deben disparar ===');
{
  reset();
  const env = makeEnv();
  const icon = env.mk({ ondblclick: "openWindow('win-memes')" }, ['dicon']);
  env.tap(icon, 200, 200);           // 160 px de desplazamiento = scroll
  check('un arrastre no abre', count("openWindow('win-memes')") === 0, EXEC);

  reset();
  const env2 = makeEnv();
  const icon2 = env2.mk({ ondblclick: "openWindow('win-memes')" }, ['dicon']);
  env2.fireDoc('touchstart', { touches: [{ clientX: 40, clientY: 40 }], cancelable: true, defaultPrevented: true }, true);
  env2.fireDoc('touchend', { target: icon2, cancelable: true, defaultPrevented: true, changedTouches: [{ clientX: 40, clientY: 40 }] }, true);
  check('un gesto ya gestionado no se duplica', count("openWindow('win-memes')") === 0, EXEC);

  reset();
  const env3 = makeEnv();
  const inp = env3.mk({}, [], 'input');
  env3.tap(inp);
  check('un campo de texto no dispara nada', EXEC.length === 0, EXEC);
}

global.Function = origFunction;
console.log('\n=== RESULTADO: ' + pass + ' OK, ' + fail + ' fallos ===');
process.exit(fail ? 1 : 0);
