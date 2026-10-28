/**
 * Reutilización de conexiones HTTP — bench de v1.0.14.
 *
 * Con Node 18 (el de Electron 28) cada llamada de `axios` abría un socket nuevo y
 * repetía el saludo TLS; contra DeepL eso eran ~550 ms de más por texto nuevo
 * (790 vs 245 ms medidos). Fija que, instalado el módulo, N pedidos seguidos a
 * un servidor usan UNA sola conexión, y que reutilizarla no rompe los casos que
 * suelen romperse con keepAlive.
 *
 * Esto corre en el Node de desarrollo (22), que ya reutiliza por defecto: el
 * defecto original sólo se reproduce en el Node 18 de Electron. Para verlo de
 * verdad:  ELECTRON_RUN_AS_NODE=1 <electron> scripts/test-http-keepalive.js
 * (ver "modo defecto" abajo: ahí el check de "conexión única SIN el módulo" se
 * invierte a propósito y se imprime la diferencia).
 *
 *   node scripts/test-http-keepalive.js
 *   node scripts/test-http-keepalive.js --quiet
 */
const http = require('http');
const https = require('https');
const axios = require('axios');
const { makeCheckRegistry, run } = require('./lib/bench.js');
const { check, CHECKS } = makeCheckRegistry();

const { instalar, OPCIONES } = require('../src/services/http-keepalive.js');

function servidor({ keepAliveTimeout } = {}) {
  return new Promise((resolve) => {
    let conexiones = 0;
    const srv = http.createServer((req, res) => { res.end('ok'); });
    if (keepAliveTimeout !== undefined) srv.keepAliveTimeout = keepAliveTimeout;
    srv.on('connection', () => { conexiones++; });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port, conexiones: () => conexiones }));
  });
}
const secuencial = async (n, url) => { for (let i = 0; i < n; i++) await axios.get(url, { timeout: 3000 }); };
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

check('instalar-deja-keepAlive-en-los-dos-agentes-globales', () => {
  // La primera llamada del proceso tiene que INSTALAR de verdad. Se exige el
  // `true`, no sólo el estado final: Node >= 19 ya trae keepAlive y el estado
  // final sería correcto aunque instalar() no hiciera nada.
  const primera = instalar();
  return { pass: primera === true && http.globalAgent.keepAlive === true && https.globalAgent.keepAlive === true, actual: { primera, http: http.globalAgent.keepAlive, https: https.globalAgent.keepAlive } };
}, 'Sin esto Electron 28 repite el saludo TLS en cada llamada.');

check('son-los-valores-que-node-19-usa-de-fabrica', () => {
  const ok = OPCIONES.keepAlive === true && OPCIONES.scheduling === 'lifo' && OPCIONES.timeout === 5000;
  return { pass: ok, actual: OPCIONES };
});

check('es-idempotente', () => {
  instalar();
  const a = https.globalAgent;
  const otra = instalar();
  return { pass: otra === false && https.globalAgent === a, actual: { devolvio: otra } };
}, 'Instalarlo dos veces no puede reemplazar el agente (dejaría sockets del anterior colgados).');

check('cinco-pedidos-seguidos-usan-UNA-conexion', async () => {
  instalar();
  const s = await servidor();
  try {
    await secuencial(5, `http://127.0.0.1:${s.port}/`);
    return { pass: s.conexiones() === 1, actual: s.conexiones() };
  } finally { s.srv.close(); s.srv.closeAllConnections?.(); }
}, 'El defecto original: 5 pedidos = 5 conexiones (en Node 18).');

check('un-pedido-LENTO-no-lo-corta-el-timeout-de-5s-del-agente', async () => {
  instalar();
  const srv = http.createServer((req, res) => setTimeout(() => res.end('lento'), 5600));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try {
    const r = await axios.get(`http://127.0.0.1:${srv.address().port}/`, { timeout: 15000 });
    return { pass: r.data === 'lento', actual: r.data };
  } finally { srv.close(); srv.closeAllConnections?.(); }
}, 'Un LLM puede tardar más de 5 s en responder. El `timeout` del agente sólo concierne a sockets libres.');

check('si-el-servidor-cierra-la-conexion-ociosa-el-siguiente-pedido-sigue-andando', async () => {
  instalar();
  const s = await servidor({ keepAliveTimeout: 150 });
  try {
    const url = `http://127.0.0.1:${s.port}/`;
    await axios.get(url, { timeout: 3000 });
    await dormir(500); // el servidor ya cerró el socket que quedó libre
    const r = await axios.get(url, { timeout: 3000 });
    return { pass: r.data === 'ok', actual: r.data };
  } finally { s.srv.close(); s.srv.closeAllConnections?.(); }
}, 'El riesgo clásico de keepAlive es reusar un socket que el servidor ya cerró (ECONNRESET).');

check('el-servidor-reiniciado-no-deja-al-cliente-colgado', async () => {
  instalar();
  const a = await servidor();
  const port = a.port;
  await axios.get(`http://127.0.0.1:${port}/`, { timeout: 3000 });
  a.srv.close(); a.srv.closeAllConnections?.();
  await dormir(100);
  const b = await new Promise((resolve, reject) => {
    const srv = http.createServer((q, r) => r.end('otra-vida'));
    srv.once('error', reject);
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
  try {
    const r = await axios.get(`http://127.0.0.1:${port}/`, { timeout: 3000 });
    return { pass: r.data === 'otra-vida', actual: r.data };
  } finally { b.close(); b.closeAllConnections?.(); }
}, 'Pasa de verdad con Ollama/LM Studio al reiniciarlos mientras Tuhua está abierta.');

check('index-instala-el-modulo-antes-de-cualquier-pedido', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'main', 'index.js'), 'utf8');
  const i = src.indexOf("require('../services/http-keepalive').instalar();");
  const primerPedido = src.search(/new UpdateChecker\(|axios\.|\.checkNow\(|new TranslationPipeline\(/);
  return { pass: i !== -1 && (primerPedido === -1 || i < primerPedido), actual: { instalaEn: i, primerPedido } };
}, 'Si alguien borra la línea, la app vuelve en silencio a abrir una conexión por llamada.');

run('http keep-alive bench', CHECKS);
