/**
 * Arranque siempre pausado (también XUAT) y enlace de Ko-fi — bench de v1.0.16.
 *
 * Lyca pidió que Tuhua "venga pausado por defecto" al reabrir. Tres métodos ya
 * lo hacían; XUAT era una excepción deliberada, y como Lyca llevaba días usando
 * XUAT nunca lo veía: el log de Windows mostraba "Starting in XUAT mode" con el
 * servidor ya levantado. Este bench fija que (a) ningún método queda exento,
 * (b) el arranque XUAT no levanta el servidor, y (c) el icono de Ko-fi apunta a
 * un destino fijo, con el canal registrado en todos los lados que tienen que
 * saberlo.
 *
 *   node scripts/test-startup-paused-kofi.js
 *   node scripts/test-startup-paused-kofi.js --quiet
 */
const fs = require('fs');
const path = require('path');
const { makeCheckRegistry, run } = require('./lib/bench.js');
const { check, CHECKS } = makeCheckRegistry();
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const indexJs = read('src', 'main', 'index.js');
const ipc = read('src', 'main', 'ipc-handlers.js');
const preload = read('src', 'preload', 'main-preload.js');
const html = read('renderer', 'main', 'index.html');
const rend = read('renderer', 'main', 'renderer.js');
const i18n = read('renderer', 'main', 'i18n.js');

// Código sin comentarios de línea, para que una frase citada no engañe al bench.
const sinComentarios = (s) => s.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
const arranque = sinComentarios(indexJs);

check('el-arranque-pausado-no-depende-del-metodo', () => {
  const ini = arranque.indexOf('ipcHandlers.register();');
  const fin = arranque.indexOf("textractor.on('text'");
  const bloque = arranque.slice(ini, fin);
  const sinIfDeMetodo = !/inputMethod\s*===\s*'xuat'/.test(bloque);
  const pausa = /_translationActive\s*=\s*false/.test(bloque) && /store\.set\('translationActive',\s*false\)/.test(bloque);
  return { pass: ini !== -1 && fin > ini && sinIfDeMetodo && pausa, actual: { sinIfDeMetodo, pausa } };
}, 'La excepción de XUAT dejaba la app "Activo" al reabrir; sin store.set el renderer leía el valor viejo.');

check('el-arranque-XUAT-no-levanta-el-servidor', () => {
  const ini = arranque.indexOf("if (settings.inputMethod === 'xuat') {\n    log.info('Starting in XUAT mode, port:'");
  const fin = arranque.indexOf("else if (settings.inputMethod === 'clipboard')", ini);
  const bloque = arranque.slice(ini, fin);
  return { pass: ini !== -1 && fin > ini && !/xuatServer\.start\(/.test(bloque), actual: bloque.slice(0, 160) };
}, 'En XUAT el ▶ del renderer es el que levanta el servidor (toggleTranslationActive → xuatStartServer).');

check('el-renderer-sincroniza-el-boton-con-el-servidor-en-XUAT', () => {
  // Si esto cambiara, un servidor sin levantar podría mostrarse como "Activo".
  const ok = /currentInputMethod === 'xuat'\)\s*\{\s*translationActive = status\.running;/.test(rend);
  return { pass: ok, actual: ok };
}, 'Es lo que hace que "servidor apagado" se vea como Pausado y no como un botón verde mentiroso.');

check('Ko-fi-destino-fijo-y-correcto', () => {
  const m = /ipcMain\.handle\('open-kofi-link',\s*\(\)\s*=>\s*\{\s*shell\.openExternal\('([^']+)'\);/.exec(ipc);
  return { pass: !!m && m[1] === 'https://ko-fi.com/lycadragen', actual: m && m[1] };
}, 'Literal en main, igual que open-docs-link: el renderer no puede pedir abrir otra URL.');

check('Ko-fi-no-recibe-URL-desde-el-renderer', () => {
  const handler = /ipcMain\.handle\('open-kofi-link',\s*\(([^)]*)\)/.exec(ipc);
  const fn = /openKofiLink:\s*\(([^)]*)\)/.exec(preload);
  return { pass: !!handler && handler[1].trim() === '' && !!fn && fn[1].trim() === '', actual: { handler: handler && handler[1], fn: fn && fn[1] } };
});

check('Ko-fi-canal-en-la-lista-blanca-del-preload-y-en-la-de-limpieza', () => {
  const enPreload = /'open-kofi-link',\n/.test(preload);
  const enLimpieza = /'open-docs-link', 'open-mail-link', 'open-kofi-link'/.test(ipc);
  return { pass: enPreload && enLimpieza, actual: { enPreload, enLimpieza } };
}, 'Un canal fuera de la lista blanca del preload falla en silencio: el botón no haría nada.');

check('Ko-fi-boton-en-la-barra-conectado-al-renderer', () => {
  const nav = html.slice(html.indexOf('<nav'), html.indexOf('</nav>'));
  const ok = /onclick="openKofiLink\(\)"/.test(nav) && /function openKofiLink\(\)\s*\{\s*api\.openKofiLink\(\);/.test(rend);
  return { pass: ok, actual: ok };
});

check('Ko-fi-tooltip-en-los-8-idiomas', () => {
  const n = (i18n.match(/^\s*kofi_title:\s*"[^"]+",$/gm) || []).length;
  return { pass: n === 8 && /data-i18n-title="kofi_title"/.test(html), actual: n };
}, 'La app tiene 8 idiomas; una clave que falta en uno cae al inglés sin avisar.');

run('startup paused + kofi bench', CHECKS);
