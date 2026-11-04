/**
 * Placeholders de la ventana principal — bench de v1.0.17.
 *
 * Con la interfaz en inglés, el campo «Nombre del perfil…» seguía en español
 * (y el de búsqueda del historial, y los del glosario…): eran `placeholder="…"`
 * escritos a mano en un solo idioma, sin data-i18n-placeholder. Este bench falla
 * si aparece otro: todo placeholder con texto de persona debe tener su clave y
 * esa clave debe existir en los 8 idiomas. Sólo se aceptan sin clave los que no
 * son texto: URLs, rutas de JSON, números y vacíos.
 *
 *   node scripts/test-i18n-placeholders.js
 *   node scripts/test-i18n-placeholders.js --quiet
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeCheckRegistry, run } = require('./lib/bench.js');
const { check, CHECKS } = makeCheckRegistry();

const html = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'main', 'index.html'), 'utf8');
const ctx = { window: {}, module: { exports: {} } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'renderer', 'main', 'i18n.js'), 'utf8') + '\n;this.__t = translations;', ctx);
const tr = ctx.__t;

const tags = [...html.matchAll(/<(input|textarea)\b[^>]*>/g)].map((m) => m[0]).filter((t) => /\splaceholder="/.test(t));
const neutro = (p) => p === '' || /^https?:\/\//.test(p) || /^[\w.]+$/.test(p) || /^\d+$/.test(p);

check('todo-placeholder-con-texto-de-persona-tiene-clave', () => {
  const malos = tags.filter((t) => {
    const p = (/\splaceholder="([^"]*)"/.exec(t) || [])[1];
    return !neutro(p) && !/data-i18n-placeholder="/.test(t);
  }).map((t) => (/\splaceholder="([^"]*)"/.exec(t) || [])[1]);
  return { pass: malos.length === 0, actual: malos };
}, 'Un placeholder escrito a mano se queda en el idioma del HTML por mucho que se cambie la interfaz.');

check('cada-clave-de-placeholder-existe-en-los-8-idiomas', () => {
  const keys = [...new Set(tags.map((t) => (/data-i18n-placeholder="([^"]+)"/.exec(t) || [])[1]).filter(Boolean))];
  const faltan = [];
  for (const l of Object.keys(tr)) for (const k of keys) if (!tr[l][k]) faltan.push(`${l}:${k}`);
  return { pass: Object.keys(tr).length === 8 && faltan.length === 0, actual: { idiomas: Object.keys(tr).length, claves: keys.length, faltan } };
}, 'Una clave que falta en un idioma cae al inglés sin avisar.');

run('i18n placeholders bench', CHECKS);
