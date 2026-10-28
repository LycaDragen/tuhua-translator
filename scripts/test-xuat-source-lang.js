/**
 * Idioma de origen de XUAT al cambiar de perfil — bench de v1.0.14.
 *
 * XUAT necesita un idioma de origen concreto: el juego traduce "desde" algo y
 * `auto` no existe para él. La interfaz comparte UN selector de origen entre
 * XUAT y los demás métodos y lo intercambia en setInputMethod(). El error:
 * init() —que corre en cada cambio de perfil— ponía en ese selector el idioma
 * del perfil NUEVO antes de llamar a setInputMethod(), y éste, al salir de
 * XUAT, leía el selector creyendo que era el valor de XUAT. Pasar de un perfil
 * XUAT a uno con origen "auto" guardaba "auto" como xuatSourceLang; al volver
 * a XUAT el selector mostraba "auto" con esa opción oculta.
 *
 * El error depende del ORDEN de dos funciones enormes del renderer, así que
 * la prueba de comportamiento real se hizo en Electron (perfil OCR "auto" ->
 * perfil XUAT -> de vuelta, con un config ya corrompido). Este banco fija lo
 * que sí se puede fijar sin ventana:
 *   - la regla (nunca "auto" ni vacío para XUAT), con la función REAL;
 *   - que los dos puntos que capturan el selector se saltan la hidratación;
 *   - que init() abre y cierra esa bandera alrededor de setInputMethod().
 *
 *   node scripts/test-xuat-source-lang.js
 *   node scripts/test-xuat-source-lang.js --quiet
 */
const fs = require('fs');
const path = require('path');
const { extractFunction } = require('./lib/renderer-harness.js');
const { makeCheckRegistry, run } = require('./lib/bench.js');
const { check, CHECKS } = makeCheckRegistry();

const SRC = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'main', 'renderer.js'), 'utf8');
const sanitize = new Function(`${extractFunction(SRC, 'sanitizeXuatSourceLang')}; return sanitizeXuatSourceLang;`)();

check('XUAT-nunca-recibe-auto-ni-vacio', () => {
  const casos = ['auto', '', null, undefined].map(sanitize);
  return { pass: casos.every((c) => c === 'en'), actual: casos };
}, 'Un config guardado por una versión anterior puede traer "auto".');

check('un-idioma-concreto-se-respeta', () => {
  const casos = ['ja', 'ko', 'zh', 'fr', 'en'].map(sanitize);
  return { pass: casos.join() === 'ja,ko,zh,fr,en', actual: casos };
});

check('setInputMethod-no-captura-el-selector-mientras-se-hidrata', () => {
  const fn = extractFunction(SRC, 'setInputMethod');
  const capturas = [
    /previousInputMethod !== 'xuat' && inputMethodInitialized && !hydratingLanguages\)\s*\{\s*globalSavedSourceLang = sourceLangEl\.value/,
    /previousInputMethod === 'xuat' && inputMethodInitialized && !hydratingLanguages\)\s*\{\s*xuatSavedSourceLang = /
  ];
  const faltan = capturas.map((re, i) => (re.test(fn) ? null : i)).filter((x) => x !== null);
  return { pass: faltan.length === 0, actual: { capturasSinGuarda: faltan } };
}, 'Es el origen del error: leer el selector cuando ya lo pisó init() con el idioma del perfil nuevo.');

check('lo-que-se-guarda-como-idioma-de-XUAT-pasa-por-la-regla', () => {
  const fn = extractFunction(SRC, 'setInputMethod');
  const ok = /xuatSavedSourceLang = sanitizeXuatSourceLang\(sourceLangEl\.value\)/.test(fn)
    && /sourceLangEl\.value = sanitizeXuatSourceLang\(xuatSavedSourceLang\)/.test(fn);
  return { pass: ok, actual: null };
});

check('init-abre-y-cierra-la-bandera-alrededor-de-setInputMethod', () => {
  const m = SRC.match(/hydratingLanguages = true;\s*try \{\s*setInputMethod\(savedInputMethod\);\s*\} finally \{\s*hydratingLanguages = false;\s*\}/);
  return { pass: !!m, actual: null };
}, 'try/finally: si setInputMethod lanzara, la bandera no puede quedar encendida y apagar para siempre el intercambio.');

check('init-fija-el-selector-de-origen-segun-el-metodo-despues-de-hidratar', () => {
  const i = SRC.indexOf('hydratingLanguages = false;');
  const resto = SRC.slice(i, i + 3500);
  const xuat = /savedInputMethod === 'xuat'[\s\S]{0,400}sourceLangEl\.value = xuatSavedSourceLang/.test(resto);
  const otros = /sourceLangEl\.value = normalizeSourceLang\(globalSavedSourceLang\)/.test(resto);
  return { pass: xuat && otros, actual: { xuat, otros } };
}, 'Sin esto el selector queda con lo que dejó el intercambio, no con el perfil cargado.');

check('un-config-corrompido-se-cura-en-disco', () => {
  return { pass: /settings\.xuatSourceLang !== xuatSavedSourceLang[\s\S]{0,120}saveSettings\(\{ xuatSourceLang: xuatSavedSourceLang \}\)/.test(SRC), actual: null };
});

run('xuat source-lang bench', CHECKS);
