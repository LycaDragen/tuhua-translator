/**
 * Seguridad del renderer — bench de v1.0.13.
 *
 * Nace de una auditoría de seguridad y de lo que se encontró al verificarla
 * contra el código. Fija tres cosas, cada una con su historia:
 *
 * 1. NADA REMOTO EN LAS VENTANAS. La ventana principal ejecutaba
 *    `<script src="https://cdn.tailwindcss.com">` en cada arranque, y es la
 *    ventana que tiene expuesto `window.tuhuaAPI` (ajustes y API keys). Un
 *    compromiso de ese CDN habría sido código ajeno con acceso a las claves.
 *    Además, sin internet —o con la caché de Electron borrada— la interfaz
 *    quedaba sin un solo estilo (se reprodujo con un perfil limpio). Ahora
 *    el script va local, fijo en 3.4.17 y con su hash.
 *
 * 2. NAVEGACIÓN BLOQUEADA. Las ventanas sólo muestran páginas locales y nada
 *    del código propio navega ni abre ventanas, así que cualquier intento es
 *    inesperado y se bloquea (src/main/navigation-guard.js). El check de
 *    abajo que fija "nada propio navega" es la PREMISA de esa política: si
 *    alguien agrega un enlace o un window.open, tiene que decidir a
 *    conciencia qué política quiere, en vez de que se rompa en silencio.
 *
 * 3. LAS PREFERENCIAS DE SEGURIDAD DE CADA VENTANA. La auditoría las señaló
 *    como un punto a favor (contextIsolation, sandbox, sin nodeIntegration);
 *    un cambio descuidado en una sola ventana nueva las perdería sin avisar.
 *
 * Es estático donde tiene que serlo (lee archivos); la verificación visual
 * del cambio de Tailwind se hizo comparando 24 capturas pixel por pixel
 * contra la versión con CDN, y la de navegación se hizo en un Electron real.
 *
 *   node scripts/test-renderer-security.js
 *   node scripts/test-renderer-security.js --quiet
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { decidirNavegacion, decidirVentanaNueva } = require(path.join('..', 'src', 'main', 'navigation-guard.js'));
const { makeCheckRegistry, run } = require('./lib/bench.js');
const { check, CHECKS } = makeCheckRegistry();

const ROOT = path.join(__dirname, '..');
const leer = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

/** Todos los HTML de ventanas de la app (menos vendor/, que es código ajeno fijado). */
function htmlsDelRenderer() {
  const out = [];
  for (const d of fs.readdirSync(path.join(ROOT, 'renderer'))) {
    const dir = path.join(ROOT, 'renderer', d);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.html')) out.push(path.join('renderer', d, f));
  }
  return out;
}

// SHA-256 de renderer/main/vendor/tailwindcss-3.4.17.js — los mismos bytes que
// sirve https://cdn.tailwindcss.com/3.4.17 (a donde redirige el CDN a secas).
const TAILWIND_SHA256 = '176e894661aa9cdc9a5cba6c720044cbbf7b8bd80d1c9a142a7c24b1b6c50d15';

// ─── 1. Nada remoto ──────────────────────────────────────────────────────
check('ninguna-ventana-carga-scripts-ni-estilos-de-internet', () => {
  const remotos = [];
  for (const f of htmlsDelRenderer()) {
    // Sin comentarios HTML: una etiqueta citada dentro de <!-- --> no se ejecuta,
    // y los comentarios de este repo explican a propósito qué había antes.
    const src = leer(f).replace(/<!--[\s\S]*?-->/g, '');
    for (const m of src.matchAll(/<script[^>]+src\s*=\s*["'](https?:)?\/\/[^"']+/gi)) remotos.push(`${f}: ${m[0].slice(0, 80)}`);
    for (const m of src.matchAll(/<link[^>]+href\s*=\s*["'](https?:)?\/\/[^"']+/gi)) remotos.push(`${f}: ${m[0].slice(0, 80)}`);
    for (const m of src.matchAll(/@import\s+(url\()?["']?(https?:)?\/\//gi)) remotos.push(`${f}: ${m[0]}`);
  }
  return { pass: remotos.length === 0, actual: remotos };
}, 'Antes: <script src="https://cdn.tailwindcss.com"> en la ventana con acceso a las API keys.');

check('tailwind-es-el-archivo-local-y-es-exactamente-el-que-sirve-el-CDN', () => {
  const archivo = path.join(ROOT, 'renderer', 'main', 'vendor', 'tailwindcss-3.4.17.js');
  const hash = crypto.createHash('sha256').update(fs.readFileSync(archivo)).digest('hex');
  const usado = /<script src="vendor\/tailwindcss-3\.4\.17\.js"><\/script>/.test(leer('renderer', 'main', 'index.html'));
  return { pass: hash === TAILWIND_SHA256 && usado, actual: { hash, usado } };
}, 'Si el hash cambia hay que VERIFICAR LA INTERFAZ A OJO en los dos temas: otra versión de Tailwind puede cambiar estilos por defecto.');

check('la-licencia-de-tailwind-viaja-con-el-archivo', () => {
  const lic = leer('renderer', 'main', 'vendor', 'LICENSE-tailwindcss.txt');
  return { pass: /MIT License/.test(lic) && /Tailwind Labs/.test(lic), actual: lic.slice(0, 80) };
}, 'MIT exige conservar el aviso de copyright en las copias.');

check('el-vendor-entra-al-empaquetado', () => {
  const files = JSON.parse(leer('package.json')).build.files;
  return { pass: files.some((g) => /^renderer\/\*\*/.test(g)), actual: files };
}, 'build.files incluye renderer/**/*: si algún día se acota, el script local dejaría de empaquetarse y la interfaz saldría sin estilos.');

// ─── 2. Navegación ───────────────────────────────────────────────────────
const ACTUAL = 'file:///C:/Program%20Files/Tuhua/resources/app.asar/renderer/main/index.html';

check('recargar-o-cambiar-el-hash-de-la-misma-pagina-se-permite', () => {
  const casos = [ACTUAL, ACTUAL + '#glosario', ACTUAL + '?x=1'].map((d) => decidirNavegacion(d, ACTUAL));
  return { pass: casos.every((c) => c === 'permitir'), actual: casos };
});

check('cualquier-otro-destino-se-bloquea', () => {
  const casos = [
    'https://evil.example/',
    'http://127.0.0.1:8419/translate?text=x',
    'file:///C:/Windows/System32/calc.exe',
    'file:///C:/Program%20Files/Tuhua/resources/app.asar/renderer/output-overlay/index.html',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'about:blank',
    'ms-msdt:/id PCWDiagnostic',
    'no es una url'
  ];
  const abiertos = casos.filter((d) => decidirNavegacion(d, ACTUAL) !== 'bloquear');
  return { pass: abiertos.length === 0, actual: abiertos };
});

check('una-ventana-nueva-siempre-se-bloquea', () => {
  const casos = ['https://example.com', 'file:///x.html', 'javascript:1', ''].map(decidirVentanaNueva);
  return { pass: casos.every((c) => c === 'bloquear'), actual: casos };
});

check('la-pagina-actual-ilegible-no-abre-nada', () => {
  return { pass: decidirNavegacion(ACTUAL, '') === 'bloquear' && decidirNavegacion(ACTUAL, undefined) === 'bloquear', actual: null };
});

check('PREMISA-nada-del-codigo-propio-navega-ni-abre-ventanas', () => {
  const hallazgos = [];
  const archivos = [...htmlsDelRenderer(), 'renderer/main/renderer.js'];
  for (const d of fs.readdirSync(path.join(ROOT, 'renderer'))) {
    const dir = path.join(ROOT, 'renderer', d);
    if (!fs.statSync(dir).isDirectory() || d === 'main') continue;
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.js')) archivos.push(path.join('renderer', d, f));
  }
  for (const f of new Set(archivos)) {
    leer(f).split('\n').forEach((linea, i) => {
      if (/window\.open\s*\(|<a\s[^>]*href|target\s*=\s*["']_blank|<webview|\blocation\.(href|assign|replace)\b/.test(linea)) {
        hallazgos.push(`${f}:${i + 1}: ${linea.trim().slice(0, 90)}`);
      }
    });
  }
  return { pass: hallazgos.length === 0, actual: hallazgos };
}, 'Es la premisa de navigation-guard.js ("todo intento de navegar es inesperado"). Si este check falla porque agregaste un enlace a propósito, no lo borres: decidí la política para ese caso en navigation-guard.js y actualizá el check.');

check('TODA-ventana-que-crea-window-manager-pasa-por-la-guarda', () => {
  const src = leer('src', 'main', 'window-manager.js');
  const creadas = (src.match(/new BrowserWindow\(/g) || []).length;
  const guardadas = (src.match(/^\s*endurecerVentana\(/gm) || []).length;
  // y la guarda tiene que quedar instalada ANTES de cargar contenido
  const desordenadas = [];
  let desde = 0;
  while (true) {
    const i = src.indexOf('new BrowserWindow(', desde);
    if (i === -1) break;
    const siguienteCarga = src.indexOf('loadFile(', i);
    const guarda = src.indexOf('endurecerVentana(', i);
    if (guarda === -1 || (siguienteCarga !== -1 && guarda > siguienteCarga)) desordenadas.push(src.slice(i, i + 45).split('\n')[0]);
    desde = i + 1;
  }
  return { pass: creadas > 0 && creadas === guardadas && desordenadas.length === 0, actual: { creadas, guardadas, desordenadas } };
}, 'Una ventana nueva sin la llamada quedaría sin protección y sin ningún error que lo diga.');

check('no-hay-BrowserWindow-fuera-de-window-manager', () => {
  const fuera = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'src', 'main')).filter((x) => x.endsWith('.js') && x !== 'window-manager.js')) {
    if (/new BrowserWindow\(/.test(leer('src', 'main', f))) fuera.push(f);
  }
  return { pass: fuera.length === 0, actual: fuera };
});

// ─── 3. Preferencias de seguridad de cada ventana ────────────────────────
check('cada-ventana-conserva-contextIsolation-sandbox-y-sin-nodeIntegration', () => {
  const src = leer('src', 'main', 'window-manager.js');
  const n = (src.match(/new BrowserWindow\(/g) || []).length;
  const cuenta = (re) => (src.match(re) || []).length;
  const r = {
    ventanas: n,
    contextIsolation: cuenta(/contextIsolation:\s*true/g),
    nodeIntegrationApagado: cuenta(/nodeIntegration:\s*false/g),
    sandbox: cuenta(/sandbox:\s*true/g),
    nodeIntegrationEncendido: cuenta(/nodeIntegration:\s*true/g),
    webSecurityApagado: cuenta(/webSecurity:\s*false/g)
  };
  const ok = r.contextIsolation === n && r.nodeIntegrationApagado === n && r.sandbox === n && r.nodeIntegrationEncendido === 0 && r.webSecurityApagado === 0;
  return { pass: ok, actual: r };
}, 'La auditoría lo señaló como punto a favor. Una ventana nueva copiada sin una de estas líneas la perdería sin avisar.');

run('renderer security bench', CHECKS);
