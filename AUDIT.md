# Auditoría de ARCSYSTEMS XP / VirusARC
*Alcance: todo el proyecto (`console.html`, `css/console.css`, `js/console.js`, `api/*.php|js`, `index.html`). Modos ejecutados: código, CSS, seguridad, juego, documentación.*

## Resumen
Proyecto bien estructurado tras la división (HTML 35 KB / CSS 65 KB / JS 250 KB), con un motor de juego técnicamente sólido (pools, atlas, rAF, resolución adaptativa). Los 3 puntos críticos: (1) la firma del leaderboard sigue siendo reproducible por cualquiera con DevTools (la sal está en el cliente), (2) hay vectores de self-XSS en el buscador simulado por `innerHTML` con input de usuario, y (3) el thread de `localStorage` se pueden corromper y romper el render del home del navegador. Todo subsanable sin tocar la experiencia.

---

## 🔒 Seguridad

| # | Hallazgo | Ubicación | Impacto real | Sugerencia |
|---|----------|-----------|--------------|------------|
| 1 | 🟠 Sal de firma expuesta al cliente | `js/console.js` (`_SEC_SALT`, `SEC_SALT`) + `api/records.*` | Cualquiera puede forjar firmas válidas con DevTools; los filtros v2 (timestamp, nonce, rate-limit, plausibilidad) reducen pero no eliminan el fraude | Sin backend de sesiones no hay fix total; documentado en README. Si un día importa de verdad: issue del servidor de un token efímero por sesión de juego + score progresivo firmado por ronda |
| 2 | 🟡 Self-XSS por `innerHTML` con input del usuario | `js/console.js:2888` (fakeHits con `tema` sin escapar), `~:3336` (command palette `q`), `~:460` (`spawnToast(msg)`) | Scripts/`<img onerror>` insertados por texto escrito en la barra de direcciones o el palette se ejecutan en la página | Escapar texto antes de inyectar: helper `esc()` existe en el foro — moverlo a utilidad global y usarlo en todos los `innerHTML` con datos externos |
| 3 | 🟡 Doble fuente de verdad en las APIs | `api/records.js` vs `api/records.php` | Si se edita una y no la otra, divergen (firma/plausibilidad) | Ya mitigado con comentarios de "source of truth"; añadir nota en el encabezado de cada uno apuntando al otro |
| 4 | 🔵 CORS `*` en ambas APIs | `api/records.php`, `api/forum.php`, `api/records.js` | Cualquier web externa puede leer/escribir (con firma válida) | Aceptable para un juego público; si se quiere endurecer: `Access-Control-Allow-Origin` a tu dominio real en producción |
| 5 | 🔵 Foro: sin límite de cuentas por IP ni captcha | `api/forum.php` | Spam de cuentas automatizable | Añadir 1 registro/IP/hora en `checkRateLimit`-style, o exigir mínima score en leaderboard para postear |
| 6 | 🔵 Tokens de sesión del foro en `localStorage` | `js/console.js` (`arc_forum_token`) | Robo por XSS (ver #2) | Al arreglar #2 este riesgo baja mucho; considera expiración corta (24h) |
| 7 | 🔵 Anti-devtools es cosmético | `index.html`, `js/console.js` (`initSecurityShield`) | No detiene a nadie; puede molestar a desarrolladores legítimos | Es "lore" del juego — documentar que es temático, no seguridad |

---

## 🐛 Código

| # | Hallazgo | Ubicación | Por qué importa | Sugerencia |
|---|----------|-----------|-----------------|------------|
| 1 | `JSON.parse(localStorage…)` sin try/catch en `renderHomePage` | `js/console.js:~2870` | Un valor corrupto en `arc_alltime_records` rompe todo el home del browser | Envolver con `safeParse()` (ya existe patrón similar) |
| 2 | 10 bloques `catch(e){}` vacíos | varios (`js/console.js:15, 1455, 2207…`) | Errores silenciosos dificultan depurar el audio/fetch | Mantener los de WebAudio (legítimos), añadir `console.warn` en fetch/sync |
| 3 | Bloque de audio/UI: muchos `setInterval` vivos para siempre | clock, popups, ad timer… | En pestaña inactiva throttlean solos; OK, pero los juegos (mines timer) sí deberían pausar al minimizar su ventana | Pausar `msTimer` cuando `win-mines` se minimiza |
| 4 | Lógica de ranking triplicada (cliente + PHP + Node) | 3 archivos | Cambios futuros hay que replicarlos a mano | El cliente solo firma y renderiza; idealmente delega el rank/dedupe al servidor |
| 5 | `js/console.js` sigue siendo un módulo de 5.000 líneas | todo el archivo | El manifiesto ayuda a navegar, pero el siguiente paso natural es separar `game.js` | Extraer STARSHIP ARC a `js/game-starship.js` (ya introduce menos riesgo ahora que el HTML está limpio) |
| 6 | Magic numbers esparcidos por el juego (cooldowns, radios, daños) | sección STARSHIP ARC | Tunear dificultad requiere "contar hexágonos" | Centralizar en un objeto `BALANCE = { railgunCd:240, ... }` al inicio del bloque del juego |

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
- ⚠️ `NV.groups` solo se limpia con `clearArena()`/reset — formaciones terminadas nunca se eliminan durante la ronda; en rondas largas crece indefinidamente. Agregar filtro: grupos sin enemigos miembros → drop.
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
1. 🟡 Escapar input del buscador/palette (#2 seguridad) — 15 minutos, alto valor.
2. 🟡 `safeParse` en localStorage del home (#1 código) — 10 minutos, evita caídas del browser.
3. 🔧 Filtro de `NV.groups` vacíos por ronda (juego).
4. 📋 Variables CSS del panel/browser (#1 CSS) — base para temas rápidos futuros.
5. Mediano plazo: extraer `js/game-starship.js` del monolito (sin cambiar lógica, con manifiesto actualizado).
