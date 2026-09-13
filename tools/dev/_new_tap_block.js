/* ============ TAP TÁCTIL → ACCIÓN (ejecución directa) ============
   HISTORIA DEL BUG (tres intentos anteriores fallidos en móvil):
   1) Los botones usan onclick/ondblclick y en móvil el navegador NO siempre
      emite el 'click' tras un tap (lo descarta si el gesto es ambiguo), así que
      no pasaba nada.
   2) Se intentó sintetizar un click. En Android el navegador a veces marca
      touchend con cancelable=false, así que la guarda lo descartaba.
   3) Peor: los iconos del escritorio usan ondblclick, y un click sintético NUNCA
      produce un dblclick, así que seguían sin abrir.

   ESTRATEGIA ACTUAL — no depender de la entrega de eventos:
   En vez de fabricar un click y confiar en que el navegador lo procese, se
   interceptan los REGISTROS de manejadores y se invocan DIRECTAMENTE al detectar
   el toque. Se cubren las tres formas en que la interfaz registra acciones:

     a) addEventListener('click' | 'dblclick', fn)     -> se intercepta y se guarda
     b) elemento.onclick / ondblclick = fn             -> se intercepta el setter
     c) atributos inline onclick="…" / ondblclick="…"  -> se leen con getAttribute

   Así la acción se ejecuta siempre, en cualquier navegador, sin depender de
   eventos sintéticos. El click nativo, si llega (Android), se deduplica por
   elemento y ventana de tiempo.

   Reglas:
   - Solo actúa en dispositivos táctiles; en escritorio no interviene en nada.
   - Si el dedo se desplaza > 10 px, era scroll: se ignora.
   - Si el gesto venía cancelado (preventDefault del joystick del juego), se ignora.
   - No actúa sobre campos de texto (les quitaría el foco y cerraría el teclado).
   - Si el elemento declara onclick y ondblclick, gana onclick (como en
     escritorio); el doble clic nativo sigue intacto porque en ordenador este
     módulo no interviene. */
function initGlobalTapToClick(){
  const MAX_DRIFT = 10;      // px de movimiento tolerados para considerarlo tap
  const PER_EL_MS = 700;     // anti rebote por elemento

  function isTouchDevice(){
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) ||
           (navigator.msMaxTouchPoints > 0) || window.innerWidth <= 768;
  }
  function isEditable(el){
    return !!(el && el.closest && el.closest('input, textarea, select, [contenteditable="true"]'));
  }

  const handlerMap = new WeakMap();   // elemento -> { click:[fn], dblclick:[fn] }
  const lastTapAt = new WeakMap();    // elemento -> instante del último tap
  const lastNative = new WeakMap();   // elemento -> instante del último click nativo
  let pending = null;                 // gesto en curso

  function handlersFor(el){
    let h = handlerMap.get(el);
    if(!h){ h = { click: [], dblclick: [] }; handlerMap.set(el, h); }
    return h;
  }
  function targetFor(el){
    return (el.closest && el.closest('button, a, .dicon, .ctx-item, .nv-btn, .nv-glass, ' +
      '.nv-primary, .meme-tile, .home-tile, .bm-btn, .space-btn, .lb-tab, .tb-win, .tbtn, ' +
      '.start-btn, .sm-item, .arc-cmd-item, .sidebar-toggle, [onclick], [ondblclick], [data-url]')) || el;
  }

  /** Ejecuta la acción del elemento: por onClick, por onDblClick o por data-url.
   *  Es la garantía de que la acción corre, sin depender de eventos sintéticos. */
  function dispatchTap(el){
    const node = targetFor(el);
    if(isEditable(node)) return;

    const now = Date.now();
    if((now - (lastTapAt.get(node) || 0)) < PER_EL_MS) return;   // rebote del mismo elemento
    lastTapAt.set(node, now);

    let ran = false;
    try {
      const h = handlerMap.get(node);
      const attrClick = (node.getAttribute && node.getAttribute('onclick')) || '';
      const attrDbl = (node.getAttribute && node.getAttribute('ondblclick')) || '';
      const propClick = (typeof node.onclick === 'function') ? node.onclick : null;
      const propDbl = (typeof node.ondblclick === 'function') ? node.ondblclick : null;
      const synth = { type: 'click', target: node, currentTarget: node, defaultPrevented: false, cancelable: true };

      // Orden: onclick primero (como en escritorio), ondblclick después.
      if(h && h.click.length)      { h.click.forEach(function(fn){ fn.call(node, synth); }); ran = true; }
      if(propClick)                { propClick.call(node, synth); ran = true; }
      if(attrClick)                { new Function('event', attrClick).call(node, synth); ran = true; }
      if(!ran){
        if(h && h.dblclick.length) { h.dblclick.forEach(function(fn){ fn.call(node, synth); }); ran = true; }
        if(propDbl)                { propDbl.call(node, synth); ran = true; }
        if(attrDbl)                { new Function('event', attrDbl).call(node, synth); ran = true; }
      }
      if(!ran && node.getAttribute){
        const url = node.getAttribute('data-url');
        if(url) loadUrl(url, true);
      }
    } catch(err){
      // Un handler que falle no debe romper el resto de la interfaz
    }
  }

  // --- Interceptar addEventListener('click' | 'dblclick') ---
  try {
    const proto = EventTarget.prototype;
    const nativeAdd = proto.addEventListener;
    const nativeRemove = proto.removeEventListener;
    proto.addEventListener = function(type, fn, opts){
      if((type === 'click' || type === 'dblclick') && typeof fn === 'function' && this && typeof this === 'object'){
        try { handlersFor(this)[type].push(fn); } catch(e){}
        const self = this;
        // Se registra también el handler normal (ratón y click nativo), pero
        // deduplicado contra el tap para no ejecutar la acción dos veces.
        return nativeAdd.call(this, type, function(ev){
          if(isTouchDevice() && ev && ev.isTrusted){
            const now = Date.now();
            if((now - (lastTapAt.get(targetFor(self)) || 0)) < PER_EL_MS) return;
            lastNative.set(targetFor(self), now);
          }
          return fn.apply(this, arguments);
        }, opts);
      }
      return nativeAdd.call(this, type, fn, opts);
    };
    proto.removeEventListener = function(type, fn, opts){
      return nativeRemove.call(this, type, fn, opts);
    };
  } catch(e){ /* si no se puede interceptar, quedan los atributos inline */ }

  // --- Interceptar elem.onclick / elem.ondblclick = fn ---
  try {
    const ep = Element.prototype;
    ['onclick','ondblclick'].forEach(function(prop){
      const d = Object.getOwnPropertyDescriptor(ep, prop);
      if(!d || !d.set) return;
      Object.defineProperty(ep, prop, {
        configurable: true, enumerable: d.enumerable,
        get: function(){ return d.get.call(this); },
        set: function(fn){
          if(typeof fn === 'function'){ try { handlersFor(this)[prop.slice(2)].push(fn); } catch(e){} }
          return d.set.call(this, fn);
        }
      });
    });
  } catch(e){ /* idem */ }

  // --- Detección del gesto ---
  document.addEventListener('pointerdown', function(e){
    if(e.pointerType === 'mouse'){ pending = null; return; }
    pending = { t: e.target, x: e.clientX, y: e.clientY, moved: false, cancelled: false };
  }, { capture: true, passive: true });

  document.addEventListener('pointermove', function(e){
    if(!pending) return;
    if(Math.abs(e.clientX - pending.x) > MAX_DRIFT || Math.abs(e.clientY - pending.y) > MAX_DRIFT){
      pending.moved = true;
    }
  }, { capture: true, passive: true });

  document.addEventListener('pointercancel', function(){ if(pending) pending.cancelled = true; }, { capture: true, passive: true });

  document.addEventListener('pointerup', function(e){
    if(e.pointerType === 'mouse'){ pending = null; return; }
    const p = pending; pending = null;
    if(!p || p.cancelled || p.moved) return;
    if(e.defaultPrevented) return;              // ya lo gestionó otro (joystick, juego)
    dispatchTap(e.target || p.t);
  }, { capture: true, passive: true });

  // Registro del click nativo (Android) para deduplicar el del navegador.
  document.addEventListener('click', function(e){
    if(!isTouchDevice()) return;
    if(e.isTrusted) lastNative.set(targetFor(e.target), Date.now());
  }, { capture: true, passive: true });
}
initGlobalTapToClick();
