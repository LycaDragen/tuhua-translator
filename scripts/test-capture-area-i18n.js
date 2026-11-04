/**
 * Ventana del área de captura del OCR en otros idiomas — bench de v1.0.17.
 *
 * Con la interfaz en inglés, el título de la ventana de captura seguía diciendo
 * «Escaneo pausado»: esa ventana es otra página con otro preload y sus textos
 * estaban escritos a mano en español. Ahora se los entrega el proceso principal
 * (captureStrings(), con el mismo i18n.js y `uiLanguage` que los diálogos nativos).
 *
 *   node scripts/test-capture-area-i18n.js
 *   node scripts/test-capture-area-i18n.js --quiet
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeCheckRegistry, run } = require('./lib/bench.js');
const { check, CHECKS } = makeCheckRegistry();
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const ipc = read('src', 'main', 'ipc-handlers.js');
const preload = read('src', 'preload', 'overlay-preload.js');
const html = read('renderer', 'capture-area', 'index.html');
const ctx = { window: {}, module: { exports: {} } };
vm.runInNewContext(read('renderer', 'main', 'i18n.js') + '\n;this.__t = translations;', ctx);
const tr = ctx.__t;

const keys = (/const CAPTURE_STRING_KEYS = \[([^\]]+)\]/.exec(ipc) || [])[1].match(/'[a-z_]+'/g).map((k) => k.slice(1, -1));

check('las-claves-de-la-ventana-existen-en-los-8-idiomas', () => {
  const faltan = [];
  for (const l of Object.keys(tr)) for (const k of keys) if (!tr[l][k]) faltan.push(`${l}:${k}`);
  return { pass: keys.length === 8 && Object.keys(tr).length === 8 && faltan.length === 0, actual: { keys: keys.length, faltan } };
});

check('captureStrings-entrega-el-idioma-de-la-interfaz', () => {
  const mainT = (store, key) => ((tr[store.get('uiLanguage')] || tr.es)[key]) || key;
  const src = ipc.slice(ipc.indexOf('const CAPTURE_STRING_KEYS'), ipc.indexOf('class IpcHandlers'));
  const fn = new Function('mainT', `${src}; return captureStrings;`)(mainT);
  const en = fn({ get: () => 'en' });
  const ja = fn({ get: () => 'ja' });
  return { pass: en.capture_paused === 'Scan paused' && ja.capture_paused === tr.ja.capture_paused && en.capture_paused !== ja.capture_paused, actual: { en: en.capture_paused, ja: ja.capture_paused } };
}, 'Es lo que recibe la ventana: el mismo diccionario que la interfaz, no uno aparte que se desincronice.');

check('la-ventana-no-escribe-textos-a-mano-en-updateStatus', () => {
  const malos = html.split('\n').filter((l) => /updateStatus\('[a-z]+',\s*'/.test(l)).map((l) => l.trim());
  return { pass: malos.length === 0, actual: malos };
}, 'Cada updateStatus con un literal es un texto que no sigue al idioma.');

check('canal-registrado-en-preload-y-en-la-limpieza', () => {
  const ok = /getCaptureStrings:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('get-capture-strings'\)/.test(preload)
    && /ipcMain\.handle\('get-capture-strings'/.test(ipc) && /'get-capture-strings',/.test(ipc.slice(ipc.indexOf('unregister()')));
  return { pass: ok, actual: ok };
});

check('cambiar-el-idioma-con-la-ventana-abierta-le-manda-los-textos', () => {
  const ok = /data\.uiLanguage !== undefined[\s\S]{0,200}sendToCaptureArea\('shortcut-pressed',\s*\{\s*action:\s*'ui-strings'/.test(ipc)
    && /data\.action === 'ui-strings'/.test(html);
  return { pass: ok, actual: ok };
}, 'Sin el empujón, la ventana (que ya está abierta durante la sesión de OCR) se quedaba en el idioma anterior.');

run('capture area i18n bench', CHECKS);
