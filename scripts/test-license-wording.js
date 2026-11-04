/**
 * Redacción de la licencia — bench de v1.0.17.
 *
 * Tuhua es CC BY-NC 4.0, y esa licencia NO es de código abierto en sentido estricto
 * (la Open Source Definition de la OSI prohíbe restringir el uso comercial). El
 * texto decía «open source» en el subtítulo de la app (8 idiomas), en
 * package.json y en la web. Este bench falla si vuelve a aparecer donde se habla
 * de la app misma. («Open source» sobre LibreTranslate o los proyectos de terceros
 * es otra cosa y sigue siendo cierto.)
 *
 *   node scripts/test-license-wording.js
 *   node scripts/test-license-wording.js --quiet
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeCheckRegistry, run } = require('./lib/bench.js');
const { check, CHECKS } = makeCheckRegistry();
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const CLAIM = /open[ -]?source|código abierto|codigo abierto|código aberto|オープンソース|开源|开放源|открыт\S* (?:исходн|код)|code source ouvert|\bopen source\b/i;

const ctx = { window: {}, module: { exports: {} } };
vm.runInNewContext(read('renderer', 'main', 'i18n.js') + '\n;this.__t = translations;', ctx);

check('el-subtitulo-de-la-app-no-dice-codigo-abierto-en-ningun-idioma', () => {
  const malos = Object.keys(ctx.__t).filter((l) => CLAIM.test(ctx.__t[l].app_subtitle || ''));
  return { pass: Object.keys(ctx.__t).length === 8 && malos.length === 0, actual: malos };
});

check('package.json-no-dice-open-source', () => {
  const d = JSON.parse(read('package.json')).description;
  return { pass: !CLAIM.test(d), actual: d };
});

check('el-primer-parrafo-de-ambos-README-no-dice-open-source', () => {
  const malos = ['README.md', 'README.es.md'].filter((f) => CLAIM.test(read(f).split('\n').slice(0, 20).join('\n')));
  return { pass: malos.length === 0, actual: malos };
});

check('la-licencia-sigue-siendo-CC-BY-NC', () => {
  return { pass: /Attribution-NonCommercial 4\.0/.test(read('LICENSE')), actual: read('LICENSE').split('\n')[0] };
}, 'Si la licencia cambiara a una de código abierto de verdad, este bench y el texto se revisan juntos.');

run('license wording bench', CHECKS);
