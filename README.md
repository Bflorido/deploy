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
  records.php         API de leaderboard (PHP — FUENTE DE VERDAD en producción)
  records.node.js     Espejo Node.js (misma lógica exacta, solo para hosts Node).
                      El sufijo ".node" evita el conflicto de despliegue que
                      provocaban "records.js" y "records.php" en el mismo directorio.
  forum.php           Foro inmutable (bcrypt + sesiones, sin editar/borrar)
data/                 JSON vivos: leaderboard, forum, ratelimit (se autogeneran)
assets/               Logos ARC/Piper, nave, items (tu astronauta: assets/astronaut.png)
assets/enemies/       Sprites SVG de enemigos (cargados al atlas del juego)
AUDIT.md              Informe de auditoría técnica del proyecto
```

## Requisitos de despliegue
- Cualquier host con **PHP 7.4+** (sin dependencias). `data/` debe tener permiso de escritura.
- Abrido localmente (`file://`): todo funciona salvo leaderboard/foro en red (fallback localStorage).
- Host **Node**: renombra/copia `api/records.node.js` a la ruta que sirva tu servidor. En este repo lleva el sufijo `.node` porque varias plataformas abortan el despliegue cuando `api/` contiene dos archivos que solo difieren en la extensión (`records.php` / `records.js`).
- Móvil: el viewport ya no usa `user-scalable=no` ni `maximum-scale` (eso disparaba avisos de accesibilidad y de "entorno de desarrollo"); el pinch-zoom queda libre y el canvas se reajusta solo.
- La detección de DevTools del "security shield" es **solo desktop** y está documentada como lore, no como seguridad real.

## Controles en móvil (Ships.exe)
Sí, el juego es jugable en celular con controles táctiles propios (no depende del teclado):
- **Joystick virtual** (abajo-izquierda): movimiento analógico. Escrito en `NV.touch.dx/dy` y leído por el mismo código de input que las flechas/WASD.
- **4 botones** (abajo-derecha): `🌀` Warp Dash · `🎵` Misiles · `⏳` Carga de railgun · `☣️` Bomba.
- **Disparo automático**: en táctil la flauta-láser dispara sola (no hay botón de fuego).
- Aparecen al empezar la partida (`nextRound()` añade `.show` a `#touchJoy`/`#touchBtns`) y se ocultan en menús, pausa, briefing y leaderboard.
- El juego detecta móvil por user-agent, `ontouchstart`, tamaño de ventana y orientación para ajustar dificultad, número de enemigos en pantalla y velocidad de oleada.

## APIs
### `api/records.php` — Leaderboard Endurecido (v2)
- Firma FNV: `name|score|round|date|ts|nonce|salt`.
- Freshness de 10 min + nonce único por IP (anti-replay).
- Rate limit por IP (8 s entre envíos, 200/día).
- Plausibilidad: `score ≤ round×6000 + 20 000` (cap 2M).
- Reseteo semanal automático (`data/weekly_epoch.txt`).
> ⚠️ La firma es una barrera, no criptografía fuerte: la sal está en el cliente. Para seguridad real haría falta un backend con sesión y score incremental firmado por el servidor.

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
