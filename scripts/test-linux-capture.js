/**
 * Captura de pantalla en Linux/Wayland — bench de v1.0.15.
 *
 * Fija la decisión de src/main/linux-capture.js y que se aplique ANTES de que la
 * app esté lista. La mecánica real (que con XDG_SESSION_TYPE=wayland Electron 28
 * contacta al portal en cada getSources(), y que con el interruptor vuelve a
 * capturar por X11) se verificó ejecutando Electron: sin el interruptor, 3
 * llamadas = 3 contactos al portal; con él, 2 fuentes de 1920x1080 en ~33 ms.
 *
 *   node scripts/test-linux-capture.js
 *   node scripts/test-linux-capture.js --quiet
 */
const fs = require('fs');
const path = require('path');
const { decidirCapturaLinux, aplicarCapturaX11, FEATURE } = require('../src/main/linux-capture.js');
const { makeCheckRegistry, run } = require('./lib/bench.js');
const { check, CHECKS } = makeCheckRegistry();

const dec = (platform, env) => decidirCapturaLinux({ platform, env });

check('Linux-con-sesion-Wayland-apaga-PipeWire', () => {
  const r = dec('linux', { XDG_SESSION_TYPE: 'wayland', WAYLAND_DISPLAY: 'wayland-0' });
  return { pass: r.aplicar === true && r.motivo === 'wayland', actual: r };
}, 'El caso del reporte: un diálogo de selección de pantalla en cada captura del OCR.');

check('no-importa-si-falta-WAYLAND_DISPLAY-o-viene-en-mayusculas', () => {
  const a = dec('linux', { XDG_SESSION_TYPE: 'wayland' });
  const b = dec('linux', { XDG_SESSION_TYPE: 'Wayland' });
  return { pass: a.aplicar && b.aplicar, actual: { a, b } };
});

check('Linux-con-X11-no-cambia-nada', () => {
  const casos = [{ XDG_SESSION_TYPE: 'x11', DISPLAY: ':0' }, { DISPLAY: ':0' }, {}].map((env) => dec('linux', env));
  return { pass: casos.every((c) => c.aplicar === false), actual: casos };
});

check('Windows-y-macOS-nunca-se-tocan-aunque-el-entorno-diga-wayland', () => {
  const env = { XDG_SESSION_TYPE: 'wayland', WAYLAND_DISPLAY: 'wayland-0' };
  const casos = ['win32', 'darwin'].map((p) => dec(p, env));
  return { pass: casos.every((c) => c.aplicar === false && c.motivo === 'no-linux'), actual: casos };
}, 'El cambio es de Linux: en las otras plataformas tiene que ser un no-op.');

check('TUHUA_CAPTURA_PORTAL=1-deja-el-comportamiento-anterior', () => {
  const r = dec('linux', { XDG_SESSION_TYPE: 'wayland', TUHUA_CAPTURA_PORTAL: '1' });
  return { pass: r.aplicar === false && r.motivo === 'portal-por-pedido', actual: r };
}, 'Salida para quien juegue con una ventana Wayland NATIVA (por XWayland saldría en negro).');

check('aplicar-agrega-la-caracteristica', () => {
  const sw = {}; const app = { commandLine: { getSwitchValue: (k) => sw[k] || '', appendSwitch: (k, v) => { sw[k] = v; } } };
  aplicarCapturaX11(app);
  return { pass: sw['disable-features'] === FEATURE, actual: sw };
});

check('aplicar-NO-pisa-lo-que-ya-habia-en-disable-features', () => {
  const sw = { 'disable-features': 'OtraCosa,Mas' };
  const app = { commandLine: { getSwitchValue: (k) => sw[k] || '', appendSwitch: (k, v) => { sw[k] = v; } } };
  aplicarCapturaX11(app);
  return { pass: sw['disable-features'] === `OtraCosa,Mas,${FEATURE}`, actual: sw };
}, 'appendSwitch REEMPLAZA el valor: sin la fusión se perderían las características que el usuario ya apagó.');

check('aplicar-dos-veces-no-duplica', () => {
  const sw = {}; const app = { commandLine: { getSwitchValue: (k) => sw[k] || '', appendSwitch: (k, v) => { sw[k] = v; } } };
  aplicarCapturaX11(app); aplicarCapturaX11(app);
  return { pass: sw['disable-features'] === FEATURE, actual: sw };
});

check('el-nombre-de-la-caracteristica-es-el-de-Chromium', () => {
  return { pass: FEATURE === 'WebRTCPipeWireCapturer', actual: FEATURE };
}, 'Verificado ejecutando Electron 28: con este nombre, getSources() deja de contactar al portal. Un nombre mal escrito no da error: simplemente no hace nada.');

check('index.js-lo-aplica-ANTES-de-app-ready', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'index.js'), 'utf8');
  // Una llamada REAL: línea que empieza con la llamada (no un comentario que la cite).
  const m = /^[ \t]*aplicarCapturaX11\(app\);/m.exec(src);
  const usa = m ? m.index : -1;
  const ready = src.indexOf('app.whenReady()');
  return { pass: usa !== -1 && ready !== -1 && usa < ready, actual: { usa, ready } };
}, 'Chromium lee --disable-features al iniciar: después de ready no hace nada, y sin ningún error que lo diga.');

run('linux capture bench', CHECKS);
