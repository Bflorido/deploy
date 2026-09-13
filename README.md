# ⚡ ARCSYSTEMS — Ecosistema VirusARC

Parodia de Windows XP + juego arcade espacial (**STARSHIP ARC: VIRUS HUNTERS**) + navegador simulado, todo como marketing del token **$VARC** en la **ARC Network** (piper.meme).

## Estructura (post-refactor)

```
index.html            Landing estilo terminal hacker (hub de entrada)
console.html          ARCSYSTEMS XP — SOLO markup (ventanas, menús, overlays) ~35 KB
css/
  console.css         Todos los estilos del escritorio, browser y juego ~64 KB
js/
  console.js          Toda la lógica: audio, boot, ventanas, antivirus, juegos,
                      STARSHIP ARC, ARC Browser, foro, seguridad ~250 KB
api/
  records.js          API de leaderboard para Vercel/Netlify (función serverless).
                      Es el backend que faltaba: en Vercel no hay PHP, así que
                      api/records.php no ejecutaba nada y los records no se
                      guardaban nunca.
  records.php         API de leaderboard para hostings PHP (Hostinger). Persistente
                      en disco: es la opción recomendada si el host tiene PHP.
  records.node.js     Servidor Node autónomo (node api/records.node.js [puerto])
  _records-core.js    Lógica compartida (firma, validación, ranking, rate limit)
  _storage.js         Almacenamiento adaptativo: Upstash/KV si hay variables, si no /tmp
  forum.php           Foro inmutable (bcrypt + sesiones, sin editar/borrar)
data/                 JSON vivos: leaderboard, forum, ratelimit (se autogeneran)
assets/               Logos ARC/Piper, nave, items (tu astronauta: assets/astronaut.png)
assets/enemies/       Sprites SVG de enemigos (cargados al atlas del juego)
tools/dev/            Utilidades de desarrollo: servidores locales y pruebas automáticas
AUDIT.md              Informe de auditoría técnica del proyecto
```

## Requisitos de despliegue
- **Hostinger / PHP 7.4+**: no hay que hacer nada especial. `data/` debe tener permiso de escritura (**chmod 755 o 775**); si no, la API ahora responde un error explícito en vez de fallar en silencio. Comprueba el estado en `api/records.php?debug=1`.
- **Vercel**: usa `api/records.js` (serverless). El filesystem de Vercel es de solo lectura, así que **sin base de datos los records se guardan en `/tmp` y pueden perderse**. Para persistencia real, crea una base **Upstash Redis** (plan gratuito) e importa las variables `KV_REST_API_URL` y `KV_REST_API_TOKEN` en el proyecto: `_storage.js` las detecta y las usa automáticamente. El endpoint declara siempre su backend en el campo `storage` de la respuesta.
- El cliente **no depende del host**: prueba `api/records.js` y, si no existe, `api/records.php`, y muestra el error real si algo falla.
- Abierto localmente (`file://`): sin red, el ranking funciona en localStorage.
- Móvil: el viewport ya no usa `user-scalable=no` ni `maximum-scale` (barrera de accesibilidad); el pinch-zoom queda libre y el canvas se reajusta solo.
- La detección de DevTools del "security shield" es **solo escritorio** y está documentada como lore, no como seguridad real. Usa la pausa del `debugger` (no el tamaño de ventana, que daba falsos positivos en móvil) y **en dispositivos táctiles ni se activa**. Se puede desactivar con `?lockdown=off` y forzar con `?lockdown=on`; si aparece, se cierra con el botón IGNORE o con Escape. *(Ojo: esos parámetros solo existen en esta versión; en una copia antigua cacheada el aviso aparecerá igual, así que no sirven para diagnosticar caché.)*
- **El caché de iOS/Chrome es la causa habitual de "sigue saliendo lo viejo".** Si tras desplegar un cambio de JS el móvil mantiene el comportamiento anterior, hay que forzar la descarga: en Chrome iOS → `⋯` → Configuración → Privacidad → Eliminar datos de navegación; o abrir la URL con un sufijo nuevo (`console.html?v=2`) que el navegador no tenga cacheado. Hay además una **guarda inline en el `<head>` de `console.html`** que borra el overlay `#secLockout` en dispositivos táctiles aunque el `console.js` servido sea antiguo — pero para que actúe, el propio `console.html` tiene que ser el nuevo.

## Leaderboard (v3) — la wallet es obligatoria
- Al terminar la partida el formulario pide **pilot name** y **your wallet**. Sin wallet válida no se guarda nada (el campo se marca en rojo y se explica el motivo).
- Formatos aceptados: dirección EVM (`0x` + 40 hex, se normaliza a minúsculas) o ENS (`nombre.eth`).
- La wallet entra en la firma: `name|score|round|date|ts|nonce|wallet|salt`. La verificación acepta también las firmas v2 y v1 para que los records antiguos sobrevivan.
- En el ranking la dirección se muestra truncada (`0x1234…ABCD`) y completa en el tooltip; en móvil la columna se oculta por falta de espacio.
- Para probar el backend en local: `node tools/dev/dev-server.js` y `node tools/dev/api-records-test.js` (34 comprobaciones de firma, wallet, dedupe, rate limit y persistencia).

## Controles en móvil (Ships.exe)
Sí, el juego es jugable en celular con controles táctiles propios (no depende del teclado):
- **Joystick virtual** (abajo-izquierda): movimiento analógico. Escrito en `NV.touch.dx/dy` y leído por el mismo código de input que las flechas/WASD.
- **4 botones** (abajo-derecha): `🌀` Warp Dash · `🎵` Misiles · `⏳` Carga de railgun · `☣️` Bomba.
- **Disparo automático**: en táctil la flauta-láser dispara sola (no hay botón de fuego).
- Aparecen al empezar la partida (`nextRound()` añade `.show` a `#touchJoy`/`#touchBtns`) y se ocultan en menús, pausa, briefing y leaderboard.
- El juego detecta móvil por user-agent, `ontouchstart`, tamaño de ventana y orientación para ajustar dificultad, número de enemigos en pantalla y velocidad de oleada.

## Experiencia móvil (escritorio ARCSYSTEMS en celular)
- **Apertura de apps por toque**: los iconos se abren con `touchend`/`pointerup`, no con `click`. En móvil el `click` sintético no siempre se emite (el navegador lo descarta si el gesto es ambiguo), y por eso antes tocar "Games" o "Ships.exe" no hacía nada. Después de un tap breve el juego queda con la arena sucia y el cronómetro corriendo; por eso también hay un **dock lateral** (`#mobileDock`) con los accesos principales siempre visibles, rellenado desde los propios `.dicon` para no duplicar configuración.
- **Ventanas como hojas**: a pantalla completa ancladas a la taskbar, con altura basada en `dvh` (se ajusta cuando el navegador oculta su barra de URL) y respeto de `safe-area-inset` en notch y barra de gestos.
- **Cerrar deslizando**: arrastrar la barra de título hacia abajo cierra la app (además del botón ✕).
- **Objetivos táctiles ≥ 40 px**: botones de ventana, taskbar y menú inicio.
- **Rotación**: al girar el móvil el dock pasa a horizontal y los iconos se compactan; el canvas se reajusta con debounce (no reconstruye el grid espacial en cada píxel de scroll).
- **Rendimiento**: el dock y el BIOS evitan trabajo innecesario; el POST intercepta `innerHTML` para volcar al DOM una vez por frame en lugar de ~75 reescrituras completas.

## APIs
### Leaderboard — `api/records.js` (Vercel) · `api/records.php` (PHP) · `api/records.node.js` (Node)
Los tres comparten las mismas reglas (el PHP las replica; `_records-core.js` es la fuente en Node):
- Firma FNV: `name|score|round|date|ts|nonce|wallet|salt`.
- **Wallet obligatoria** (`0x…` de 40 hex o `nombre.eth`).
- Freshness de 10 min + nonce único por IP (anti-replay).
- Rate limit por IP (8 s entre envíos, 200/día).
- Plausibilidad: `score ≤ round×6000 + 20 000` (cap 2M).
- Dedupe por piloto (una fila por nombre, se conserva la mejor puntuación).
- Reseteo semanal automático.
- Errores **visibles**: el cliente muestra el motivo (403 firma, 422 wallet, 429 rate limit, 500 almacenamiento) en vez de tragárselo.
- Diagnóstico: `GET api/records.php?debug=1` (o `api/records.js?debug=1`) informa backend de almacenamiento y si es escribible/persistente.
> ⚠️ La firma es una barrera, no criptografía fuerte: la sal está en el cliente. La wallet acredita **a dónde pagar**, no prueba propiedad de la dirección. Para seguridad real haría falta un backend con sesión, score incremental firmado por el servidor y firma de mensaje (EIP-191) del propietario.

### `api/forum.php` — Foro inmutable
- `register` (user 3-12 chars, pass ≥4, bcrypt) · `login` → token 7 días.
- `post` (1-400 chars, 1 post/15 s por usuario) · `?action=posts` → últimos 50.
- **Sin endpoints de editar/borrar**: lo escrito queda escrito para siempre.

## STARSHIP ARC: VIRUS HUNTERS (Ships.exe)
- Intro cinematográfica ARC STUDIOS / PIPER STUDIO con jingles WebAudio.
- Conteo **3-2-1 con arena limpia** entre sectores; sectores infinitos con afijos (banner de advertencia incluido).
- Habilidades: `SHIFT` Warp Dash · `X` Railgun · `C` Orbital Strike · `B` Bomb · `P` pausa.
- **Vida extra cada 25 000 pts** (máx 5); combo con aviso visual de expiración; power-ups dropean de élites.
- Enemigos con sprites `assets/enemies/*.svg` prerrenderizados en atlas; Splitter se divide al morir, Beacon lanza patrones espirales + buffs.
- Leaderboard integrado (semanal e histórico) con firma v2.

## Escritorio ARCSYSTEMS (experiencia de SO)
- Boot con BIOS POST realista (conteo de memoria animado) + login jingle.
- Ventanas arrastrables/redimensionables; maximizado con contenido adaptativo; taskbar muestra solo apps abiertas.
- Reloj con tooltip de fecha completa; notificaciones ambientales simuladas de la red.
- Motor de "virus" en popups: activo siempre excepto dentro del ARC Browser y Ships.exe; el antivirus purga todo y da 60 s de paz.
- Minijuegos: Minesweeper, Spider Solitaire, Space Pinball; ARC Browser con tabs, marcadores, synth, tienda, foro.

## Buenas prácticas aplicadas
- `esc()` / `safeParse()` globales: todo input de usuario va escapado antes de `innerHTML`.
- Paleta CSS en `:root` (`--arc-cyan`, etc.) + `:focus-visible` para accesibilidad por teclado.
- Sombra de integridad de score + heartbeat anti-tamper (decorativo, es lore).

## Créditos
- Intro: **ARC STUDIOS** / **PIPER STUDIO & MEDIA ENTERTAINMENT**.
- Audio: 100% sintetizado con WebAudio (sin assets externos).
