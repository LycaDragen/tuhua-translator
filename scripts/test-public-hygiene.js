/**
 * Higiene de lo público — bench de v1.0.17.
 *
 * Este repositorio es público. Los comentarios, tests y el CHANGELOG decían cosas como
 * «Lyca pidió…» o «reportado por Lyca», que vienen de conversaciones privadas, y varios
 * archivos tenían el correo personal del autor y una ruta de Windows con su usuario real.
 * Un cambio se documenta como el HECHO (qué pasaba, qué se hizo), sin nombrar a quien lo
 * pidió ni a quien lo encontró. Este bench falla si vuelve alguna de esas cosas.
 *
 * Lo que sí puede nombrar al autor: la licencia, el README (sección Autor/Licencia),
 * `package.json` (author) y las URLs (github.com/LycaDragen, tuhua.lyca.dev).
 *
 *   node scripts/test-public-hygiene.js
 *   node scripts/test-public-hygiene.js --quiet
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { makeCheckRegistry, run } = require('./lib/bench.js');
const { check, CHECKS } = makeCheckRegistry();

const root = path.join(__dirname, '..');
const SELF = 'scripts/test-public-hygiene.js';
const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n')
  .filter((f) => f && f !== SELF && !/\.(png|ico|svg|woff2?|traineddata|onnx|zip|gz)$/i.test(f) && !f.includes('vendor/'));
const text = (f) => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch { return ''; } };
const sinUrls = (s) => s.replace(/LycaDragen|lycadragen|lyca\.dev/gi, '');

check('ningun-comentario-ni-test-ni-changelog-nombra-a-una-persona', () => {
  const zonas = files.filter((f) => /^(src|renderer|scripts|docs)\//.test(f) || f === 'CHANGELOG.md');
  const malos = [];
  for (const f of zonas) text(f).split('\n').forEach((l, i) => { if (/Lyca/.test(sinUrls(l))) malos.push(`${f}:${i + 1}`); });
  return { pass: malos.length === 0, actual: malos.slice(0, 10) };
}, 'Documentar el hecho, no quién lo pidió: «Lyca pidió X» → «X».');

check('el-correo-personal-no-esta-en-ningun-archivo-versionado', () => {
  const malos = files.filter((f) => /sebaguerra6|@gmail\.com/i.test(text(f)));
  return { pass: malos.length === 0, actual: malos };
}, 'El contacto público es help@tuhua.lyca.dev.');

check('ninguna-ruta-de-windows-con-un-usuario-real', () => {
  const malos = files.filter((f) => /Users\\+(sebag|lyca)\b/i.test(text(f)));
  return { pass: malos.length === 0, actual: malos };
}, 'Los fixtures usan C:\\Users\\Player.');

check('package.json-y-LICENSE-usan-el-correo-publico', () => {
  const p = JSON.parse(text('package.json'));
  const ok = p.author.email === 'help@tuhua.lyca.dev' && /help@tuhua\.lyca\.dev/.test(text('LICENSE'));
  return { pass: ok, actual: { author: p.author.email } };
});

run('public hygiene bench', CHECKS);
