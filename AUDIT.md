# Auditoría de ARCSYSTEMS XP / VirusARC
*Alcance: todo el proyecto (`console.html`, `css/console.css`, `js/console.js`, `api/*.php|js`, `index.html`). Modos ejecutados: código, CSS, seguridad, juego, documentación.*

## Resumen
Proyecto bien estructurado tras la división (HTML 35 KB / CSS 65 KB / JS 250 KB), con un motor de juego técnicamente sólido (pools, atlas, rAF, resolución adaptativa). Punto crítico restante: la firma del leaderboard sigue siendo reproducible por cualquiera con DevTools (la sal está en el cliente), lo cual no tiene arreglo real sin backend de sesiones. Los vectores de self-XSS, el `localStorage` sin proteger y el crecimiento de `NV.groups` **ya están corregidos** (ver "Correcciones aplicadas").

---

## ✅ Correcciones aplicadas (esta pasada)
| # | Hallazgo original | Estado | Qué se hizo |
|---|-------------------|--------|-------------|
| 1 | Self-XSS por `innerHTML` con input del usuario | ✅ Cerrado | `renderSearchResults()` escapaba la query sin escapar (era la ruta viva: se dispara buscando "konami", "arc", "piper"…); ahora usa `esc()` en query, url, title y desc. `renderTabs()` también escapa `tab.title`/favicon/id, y `spawnToast(msg)` escapa su mensaje. `fakeHits` y el command palette ya estaban bien. |
| 2 | `JSON.parse(localStorage…)` sin try/catch en `renderHomePage` | ✅ Ya resuelto | Usa `safeParse()` en `renderHomePage` y `renderLeaderboardPage`. |
| 3 | `NV.groups` nunca purgaba formaciones terminadas | ✅ Ya resuelto | El loop purga cada frame los grupos sin miembros vivos y los que salen de pantalla (`NV.groups=NV.groups.filter(...)`). |
| 4 | Anti-devtools se disparaba en móvil (falso positivo) | ✅ Cerrado (2ª iteración) | El aviso "Developer inspection environment detected" venía de comparar `outerWidth/outerHeight` con `innerWidth/innerHeight`: esa diferencia es el chrome del navegador y en móvil/webview supera cualquier umbral SIEMPRE. El primer blindaje (`innerWidth < 900` + `pointer:coarse`) **tampoco era fiable**: tablets, móviles grandes, ventanas estrechas y webviews con stylus/hover lo pasaban. Se **eliminó la comprobación por dimensiones** y ahora la detección usa la pausa del `debugger`, con la vigilancia armada solo si el dispositivo es escritorio real (sin táctil + `pointer: fine` + hover + sin `any-pointer: coarse`). En móvil/tablet el intervalo **ni se programa**. Escape: `?lockdown=off`, botón IGNORE y tecla Escape. |
| 5 | Conflicto de despliegue `api/records.js` vs `api/records.php` | ✅ Cerrado | El espejo Node pasa a `api/records.node.js`; las plataformas que rechazaban dos archivos con el mismo nombre base dejan de abortar el deploy. |
| 6 | ID duplicado `win-config` (dos ventanas Settings con `wpGrid`/`thGrid`) | ✅ Cerrado | Se eliminó el bloque muerto de `console.html`; `buildConfig()` ya no pisa un grid sin listeners. |
| 7 | Viewport restrictivo en móvil | ✅ Cerrado | `user-scalable=no` + `maximum-scale=1.0` fuera: es barrera de accesibilidad (WCAG 1.4.4). El canvas se reajusta solo al zoom. |
| 8 | **Los records no se guardaban en Vercel/Hostinger** | ✅ Cerrado | Tres causas encadenadas: (a) **no existía backend Node** (`api/records.js` es ahora una función serverless real; antes solo había `records.node.js`, que no es un handler válido en Vercel) y en Vercel `records.php` no ejecuta; (b) el cliente **solo** llamaba a `api/records.php` y **se tragaba todos los errores** con `catch` vacíos; (c) en Vercel el filesystem es de solo lectura, así que hace falta `_storage.js` (Upstash/KV, o `/tmp` con aviso). Ahora el cliente prueba los endpoints en orden y muestra el error real. |
| 9 | Bug en el módulo de almacenamiento: `load()` devolvía `null` para objetos | ✅ Cerrado | `fileLoad` solo aceptaba arrays, y la tabla de **rate limit es un objeto** → se leía como vacía y el limitador **nunca se aplicaba** (la primera petición de cada par siempre pasaba). Detectado con una prueba que separaba las llamadas en el tiempo. |
| 10 | `core.clientIp()` llamado sin argumentos | ✅ Cerrado | Accedía a `headers['x-forwarded-for']` de `undefined`; al ser un handler `async` sin `try` externo, la petición **quedaba colgada sin respuesta**. Ahora se le pasan `req.headers` y el socket. |
| 11 | FNV de PHP frágil en builds de 32 bits | ✅ Endurecido | El original era correcto en PHP de 64 bits (la coerción entera enmascara a 32 bits, no pasa por float), pero en un PHP de 32 bits `$h * 0x01000193` desbordaría a float y perdería bits → 403 en todos los records. `fnvMul32()` ahora trocea en mitades de 16 bits con acarreo: verificado contra `Math.imul` y contra BigInt en 20.000 casos. |
| 12 | Asteroides que embisten naves enemigas | ✅ Mejorado | Ya explotaban; faltaba feedback. Ahora el impacto marca el asteroide, suelta chispas, suena (con límite anti-saturación), agita la cámara y suma 40 puntos. |
| 13 | Motor de virus: ritmo agotador y cadenas infinitas | ✅ Cerrado | Antes ~70% cada 2,2 s, hasta 5 ventanas, y **cada Accept/Ignore/✕ lanzaba otra**. Ahora: una cada 45-90 s, máximo 2 en pantalla, silencio de 90 s al cerrar una y sin cadenas. |
| 14 | Los botones no hacían nada en Android (aunque se veían pulsados) | ✅ Cerrado | **Bug propio** en el sintetizador de tap: usaba una sola variable para dos significados ("yo sinteticé esto" y "el navegador ya emitió el click"). Android Chrome sí emite el click nativo, así que fijaba la marca y **la síntesis se bloqueaba a sí misma**; en iOS, donde no hay click nativo, funcionaba. Ahora hay dos marcas separadas (`syntheticInFlight` / `clickSeenAt`) y una **vía 2 de respaldo** que ejecuta directamente el handler del botón (por propiedad o por atributo) si tras sintetizar el click nadie lo gestionó. |
| 15 | Chrome iOS seguía mostrando el lockdown | ✅ Cerrado | Chrome iOS conservaba en caché el `console.html` antiguo, así que no corría ni la guarda del `<head>`. Se añadió **sello de versión** a los recursos (`?v=4`) para que el cambio de archivo implique URL nueva, y el README documenta que hay que subir el número en cada despliegue de JS/CSS. |

---

## 🔒 Seguridad

| # | Hallazgo | Ubicación | Impacto real | Sugerencia |
|---|----------|-----------|--------------|------------|
| 1 | 🟠 Sal de firma expuesta al cliente | `js/console.js` (`_SEC_SALT`, `SEC_SALT`) + `api/records.*` | Cualquiera puede forjar firmas válidas con DevTools; los filtros v2 (timestamp, nonce, rate-limit, plausibilidad) reducen pero no eliminan el fraude | Sin backend de sesiones no hay fix total; documentado en README. Si un día importa de verdad: issue del servidor de un token efímero por sesión de juego + score progresivo firmado por ronda |
| 2 | ✅ Self-XSS por `innerHTML` con input del usuario | `js/console.js` (`renderSearchResults`, `renderTabs`, `spawnToast`) | **Corregido** — ver "Correcciones aplicadas" #1 | Mantener la regla: cualquier dato externo pasa por `esc()` antes de `innerHTML` |
| 3 | 🟡 Doble fuente de verdad en las APIs | `api/records.node.js` vs `api/records.php` | Si se edita una y no la otra, divergen (firma/plausibilidad) | Ya mitigado con comentarios de "source of truth"; añadir nota en el encabezado de cada uno apuntando al otro |
| 4 | 🔵 CORS `*` en ambas APIs | `api/records.php`, `api/forum.php`, `api/records.node.js` | Cualquier web externa puede leer/escribir (con firma válida) | Aceptable para un juego público; si se quiere endurecer: `Access-Control-Allow-Origin` a tu dominio real en producción |
| 5 | 🔵 Foro: sin límite de cuentas por IP ni captcha | `api/forum.php` | Spam de cuentas automatizable | Añadir 1 registro/IP/hora en `checkRateLimit`-style, o exigir mínima score en leaderboard para postear |
| 6 | 🔵 Tokens de sesión del foro en `localStorage` | `js/console.js` (`arc_forum_token`) | Robo por XSS (ver #2) | Al arreglar #2 este riesgo baja mucho; considera expiración corta (24h) |
| 7 | 🔵 Anti-devtools es cosmético | `index.html`, `js/console.js` (`initSecurityShield`) | No detiene a nadie; puede molestar a desarrolladores legítimos | Es "lore" del juego — documentar que es temático, no seguridad |

---

## 🐛 Código

| # | Hallazgo | Ubicación | Por qué importa | Sugerencia |
|---|----------|-----------|-----------------|------------|
| 1 | ✅ `JSON.parse(localStorage…)` sin try/catch en `renderHomePage` | `js/console.js` | **Corregido** — usa `safeParse()`; ver "Correcciones aplicadas" #2 | Mantener `safeParse()` para todo `localStorage` |
| 2 | 10 bloques `catch(e){}` vacíos | varios (`js/console.js:15, 1455, 2207…`) | Errores silenciosos dificultan depurar el audio/fetch | Mantener los de WebAudio (legítimos), añadir `console.warn` en fetch/sync |
| 3 | Bloque de audio/UI: muchos `setInterval` vivos para siempre | clock, popups, ad timer… | En pestaña inactiva throttlean solos; OK, pero los juegos (mines timer) sí deberían pausar al minimizar su ventana | Pausar `msTimer` cuando `win-mines` se minimiza |
| 4 | Lógica de ranking triplicada (cliente + PHP + Node) | 3 archivos | Cambios futuros hay que replicarlos a mano | El cliente solo firma y renderiza; idealmente delega el rank/dedupe al servidor |
| 5 | `getWeeklyData()` definida dos veces | `js/console.js` (bloque de leaderboard) | La segunda definición gana y la primera es código muerto: confunde al mantener | Borrar la primera o unificar en una sola función |
| 6 | `js/console.js` sigue siendo un módulo de 5.000 líneas | todo el archivo | El manifiesto ayuda a navegar, pero el siguiente paso natural es separar `game.js` | Extraer STARSHIP ARC a `js/game-starship.js` (ya introduce menos riesgo ahora que el HTML está limpio) |
| 7 | Magic numbers esparcidos por el juego (cooldowns, radios, daños) | sección STARSHIP ARC | Tunear dificultad requiere "contar hexágonos" | Centralizar en un objeto `BALANCE = { railgunCd:240, ... }` al inicio del bloque del juego |

---

## 🎨 CSS

| # | Hallazgo | Evidencia | Sugerencia |
|---|----------|-----------|------------|
| 1 | Sin tokens de color: 620 hex sueltos | `css/console.css` | Crear variables `:root { --arc-cyan:#00d4ff; --arc-green:#00ff41; --arc-red:#ff003c; --arc-amber:#fbbf24; --panel:#252535; --panel-border:#3d3d4d; }` y migrar los paneles del browser/game; el tema retro del escritorio puede quedarse con sus valores históricos |
| 2 | 34 `!important` | todo el CSS | Revisar los de `.window`/`.tb-win` — la mayoría se puede eliminar subiendo especificidad o reordenando cascada |
| 3 | 5 `outline:none` | specified elements | Accesibilidad: añadir `:focus-visible { outline:2px solid var(--arc-cyan) }` para no bloquear navegación por teclado |
| 4 | ~1.200 valores `px` | todo | La interfaz retro justifica muchos px; aún así, textos fluidos con `clamp()` (ya hay ejemplos) y tap targets ≥44px en móviles |
| 5 | Solo 3 breakpoints | media queries | Hay buen detalle mobile ya; considera `1024px` intermedio para tablets landscape en el desktop layout |
| 6 | Scrollbars del contenido del browser no estilizadas | `.browser-content` | Hereda scrollbar nativa gris — estilizar con el mismo thumb cyan de la terminal |

---

## 🎮 Juego (STARSHIP ARC)

### Técnico (rendimiento/arquitectura) — mayoría en buen estado ✅
- ✅ `requestAnimationFrame` con `dtScale` (delta-time correcto), pools de partículas/balas, atlas de texturas de enemigos, spatial grid, resolución adaptativa.
- ✅ `NV.groups` solo se limpia con `clearArena()`/reset — formaciones terminadas nunca se eliminan durante la ronda; en rondas largas crece indefinidamente. Agregar filtro: grupos sin enemigos miembros → drop. **Resuelto**: el loop purga grupos sin miembros vivos y los que salen de pantalla.
- ⚠️ `spawnEnemyBullet`/`spawnPlayerBullet` usan pools pero hay rutas (`sonicRings`, `decoys`) que empujan objetos sin pool — bajo volumen, aceptable; si aparecen picos de GC en `orbital strike` simultáneos, poolízalas también.
- ✅ El autoescalado de resolución con histéresis está bien planteado.

### Diseño (niveles/escenarios/feel)
- ✅ Conteo 3-2-1 + arena limpia entre sectores: gran mejora de legibilidad.
- ✅ Grace period sin fuego + suavidad en sectores 1-2: buena curva inicial.
- 🔧 Sugerencia: introducir cada afijo con un "banner de advertencia" de 1.5s (`☀️ SOLAR FLARE DETECTED`) en vez de andar solo en el título — el jugador entiende la regla nueva antes de morir por ella.
- 🔧 El combo se corta sin aviso al timeout (120f); una barra pequeña bajo el combo o un fade-out avisaría cuándo expira.
- 🔧 Vida extra solo por jefe: en rachas retro como esta, considera "cada 25.000 pts = vida" para recompensar el juego limpio prolongado.

---

## 📄 Documentación
- `README.md` ya describe arquitectura, APIs y cómo desplegar ✅
- Manifiesto de secciones al inicio de `js/console.js` ✅
- Pendiente (bajo esfuerzo): añadir al README el mapa final de archivos tras la división (css/js), y 3-4 docstrings clave en `nextRound()`, `spawnSquad()`, `loadUrl()` y `computeSig()` explicando el *porqué* (pacing, dedupe, firma).

## Próximos pasos sugeridos (prioridad)
1. ✅ ~~Escapar input del buscador/palette (#2 seguridad)~~ — hecho (`renderSearchResults`, `renderTabs`, `spawnToast`).
2. ✅ ~~`safeParse` en localStorage del home (#1 código)~~ — ya estaba aplicado.
3. ✅ ~~Filtro de `NV.groups` vacíos por ronda (juego)~~ — ya estaba aplicado.
4. ✅ ~~Falso positivo del anti-devtools en móvil + viewport restrictivo~~ — hecho.
5. ✅ ~~Conflicto de despliegue `api/records.js` / `api/records.php`~~ — renombrado a `api/records.node.js`.
6. 🔧 Borrar la duplicada de `getWeeklyData()` (#5 código) — 5 minutos.
7. 📋 Variables CSS del panel/browser (#1 CSS) — base para temas rápidos futuros.
8. 🎮 Revisar el espaciado táctil de los botones de habilidad en pantallas muy pequeñas (<390 px) una vez probado en dispositivo real.
9. Mediano plazo: extraer `js/game-starship.js` del monolito (sin cambiar lógica, con manifiesto actualizado).
5. Mediano plazo: extraer `js/game-starship.js` del monolito (sin cambiar lógica, con manifiesto actualizado).
