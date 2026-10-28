/**
 * Servidor XUAT: quién puede hablarle — bench de v1.0.13.
 *
 * Una auditoría de seguridad señaló que el servidor escucha en 0.0.0.0 con
 * `Access-Control-Allow-Origin: *` y sin ninguna comprobación, de modo que
 * otro equipo de la red, o cualquier página web abierta en el navegador del
 * usuario, podía pedirle traducciones y gastar la cuota de su motor (DeepL,
 * OpenAI, …). Una página no necesita ni leer la respuesta: un GET simple se
 * envía igual aunque CORS impida verla.
 *
 * El arreglo NO cambia dónde escucha, ni el puerto, ni la URL que el
 * instalador ya escribió en los juegos instalados (ver el comentario largo
 * sobre evaluarPedido() en xuat-server.js para el porqué). Rechaza por quién
 * llama.
 *
 * Lo que este banco tiene que defender, por orden de importancia:
 *  1. Que un juego REAL siga traduciendo. Un juego es un proceso local que
 *     no manda `Origin` ni `Sec-Fetch-*`, con Host 127.0.0.1:<puerto>. Si
 *     esto se rompe, XUAT deja de funcionar para todos y no hay forma de
 *     probarlo acá con un Unity de verdad, así que es lo que más se fija.
 *  2. Que lo que no es un juego quede afuera.
 *
 * Los checks de red usan el servidor REAL escuchando de verdad.
 *
 *   node scripts/test-xuat-server-guard.js
 *   node scripts/test-xuat-server-guard.js --quiet
 */
const http = require('http');
const os = require('os');
const path = require('path');

const XuatServer = require(path.join('..', 'src', 'services', 'xuat-server.js'));
const { evaluarPedido, esParLocal, esHostLocal } = XuatServer;

const { makeCheckRegistry, run } = require('./lib/bench.js');
const { check, CHECKS } = makeCheckRegistry();

/** Interfaces de una máquina inventada, para no depender de la que corre el banco. */
const IFACES = {
  Ethernet: [{ address: '192.168.1.50', internal: false, family: 'IPv4' }],
  'vEthernet (WSL)': [{ address: '172.28.0.1', internal: false, family: 'IPv4' }, { address: 'fe80::1', internal: false, family: 'IPv6' }],
  Loopback: [{ address: '127.0.0.1', internal: true, family: 'IPv4' }, { address: '::1', internal: true, family: 'IPv6' }]
};
const ENV = { interfaces: IFACES, hostname: 'DESKTOP-ABC' };
const pedido = (peer, headers = {}) => ({ socket: { remoteAddress: peer }, headers });

// ─── 1. Que un juego real siga funcionando ───────────────────────────────
check('un-juego-por-loopback-pasa', () => {
  // Lo que manda Unity/.NET: Host con la URL que escribió el instalador, y
  // ninguna cabecera de navegador.
  return { pass: evaluarPedido(pedido('127.0.0.1', { host: '127.0.0.1:8419', 'user-agent': 'UnityPlayer/2021.3' }), ENV) === null, actual: null };
}, 'Es EL check. Si falla, XUAT deja de traducir en todos los juegos instalados.');

check('un-juego-que-usa-la-IP-de-la-propia-maquina-pasa', () => {
  // La razón declarada de v3.11.9 para escuchar en 0.0.0.0: que el juego no
  // llegara por loopback. Si llega por la IP de la red, el par ES esa IP.
  return { pass: evaluarPedido(pedido('192.168.1.50', { host: '192.168.1.50:8419' }), ENV) === null, actual: null };
});

check('un-juego-por-localhost-o-por-el-nombre-de-la-maquina-pasa', () => {
  const casos = [
    evaluarPedido(pedido('127.0.0.1', { host: 'localhost:8419' }), ENV),
    evaluarPedido(pedido('::1', { host: '[::1]:8419' }), ENV),
    evaluarPedido(pedido('127.0.0.1', { host: 'desktop-abc:8419' }), ENV)
  ];
  return { pass: casos.every((c) => c === null), actual: casos };
});

check('un-cliente-HTTP-1.0-sin-Host-pasa', () => {
  return { pass: evaluarPedido(pedido('127.0.0.1', {}), ENV) === null, actual: null };
}, 'Un cliente mínimo puede no mandar Host; rechazarlo sería inventar una exigencia que el servidor nunca tuvo.');

check('IPv4-mapeada-en-IPv6-cuenta-como-local', () => {
  return { pass: esParLocal('::ffff:127.0.0.1', IFACES) && esParLocal('::ffff:192.168.1.50', IFACES), actual: null };
});

check('el-usuario-escribiendo-la-URL-a-mano-pasa', () => {
  // Sec-Fetch-Site: none = navegación iniciada por el usuario, p. ej. para
  // mirar /status. Es el único valor de esa cabecera que se acepta.
  return { pass: evaluarPedido(pedido('127.0.0.1', { host: '127.0.0.1:8419', 'sec-fetch-site': 'none' }), ENV) === null, actual: null };
});

// ─── 2. Lo que queda afuera ──────────────────────────────────────────────
check('otro-equipo-de-la-red-queda-afuera', () => {
  const r = evaluarPedido(pedido('192.168.1.77', { host: '192.168.1.50:8419' }), ENV);
  return { pass: r && r.reason === 'par-remoto', actual: r };
}, 'Éste es el hallazgo original: antes cualquiera en la red local podía gastar la cuota.');

check('un-par-desconocido-se-trata-como-remoto-no-como-local', () => {
  const casos = [evaluarPedido(pedido(undefined, {}), ENV), evaluarPedido(pedido('', {}), ENV), evaluarPedido({ headers: {} }, ENV)];
  return { pass: casos.every((c) => c && c.reason === 'par-remoto'), actual: casos };
}, 'Ante la duda, afuera: un socket ya destruido no puede colar un pedido.');

check('DNS-rebinding-queda-afuera', () => {
  // Una página hostil cuyo dominio resuelve a 127.0.0.1: el par ES local,
  // pero el navegador manda el dominio de la página como Host.
  const r = evaluarPedido(pedido('127.0.0.1', { host: 'evil.example:8419' }), ENV);
  return { pass: r && r.reason === 'host-ajeno', actual: r };
});

check('una-pagina-web-con-Origin-queda-afuera', () => {
  const r = evaluarPedido(pedido('127.0.0.1', { host: '127.0.0.1:8419', origin: 'https://evil.example' }), ENV);
  return { pass: r && r.reason === 'navegador', actual: r };
});

check('una-pagina-web-sin-Origin-pero-con-Sec-Fetch-Site-queda-afuera', () => {
  // <img src="http://127.0.0.1:8419/translate?text=…"> no manda Origin, pero
  // los navegadores modernos marcan Sec-Fetch-Site: cross-site.
  const casos = ['cross-site', 'same-site', 'same-origin'].map((v) => evaluarPedido(pedido('127.0.0.1', { host: '127.0.0.1:8419', 'sec-fetch-site': v }), ENV));
  return { pass: casos.every((c) => c && c.reason === 'navegador'), actual: casos };
});

check('un-nombre-de-host-casi-local-no-engana', () => {
  const casos = ['localhost.evil.example', 'evil-localhost', '127.0.0.1.evil.example', 'foo.localhost'];
  const colados = casos.filter((h) => esHostLocal(h + ':8419', 'desktop-abc'));
  return { pass: colados.length === 0, actual: colados };
});

// ─── 3. Servidor real, por la red de verdad ──────────────────────────────
const pipelineFalso = { translateNow: async (texto) => `[es] ${texto}` };
const puertoAlAzar = () => 41000 + Math.floor(Math.random() * 2000);

function pedir(puerto, { host, headers = {}, ruta = '/status', metodo = 'GET', destino = '127.0.0.1' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: destino, port: puerto, path: ruta, method: metodo, headers: host ? { Host: host, ...headers } : headers }, (res) => {
      let cuerpo = '';
      res.on('data', (c) => (cuerpo += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, cuerpo }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

async function conServidor(fn) {
  const srv = new XuatServer(pipelineFalso, puertoAlAzar());
  const silenciar = console.log; const silenciarW = console.warn;
  console.log = () => {}; console.warn = () => {};
  try {
    await srv.start();
    console.log = silenciar;
    return await fn(srv.port);
  } finally {
    console.log = silenciar; console.warn = silenciarW;
    await srv.stop();
  }
}

check('servidor-real-un-juego-traduce-por-la-red', async () => {
  return conServidor(async (puerto) => {
    const r = await pedir(puerto, { ruta: '/translate?text=hola&from=ja&to=es', headers: { 'User-Agent': 'UnityPlayer/2021.3' } });
    return { pass: r.status === 200 && r.cuerpo === '[es] hola', actual: { status: r.status, cuerpo: r.cuerpo } };
  });
}, 'El camino completo, sin simular nada: socket real, request real, la traducción vuelve.');

check('servidor-real-sigue-alcanzable-por-la-IP-de-la-maquina', async () => {
  const propia = Object.values(os.networkInterfaces()).flat().find((n) => n.family === 'IPv4' && !n.internal);
  if (!propia) return { pass: true, actual: 'OMITIDO: esta máquina no tiene una IP de red no-loopback' };
  return conServidor(async (puerto) => {
    const r = await pedir(puerto, { destino: propia.address, ruta: '/translate?text=hola&from=ja&to=es' });
    return { pass: r.status === 200 && r.cuerpo === '[es] hola', actual: { ip: propia.address, status: r.status } };
  });
}, 'Es la razón por la que se mantuvo el listen en 0.0.0.0: un proceso local que llega por la IP de la red tiene que seguir traduciendo.');

check('servidor-real-rechaza-Origin-Host-ajeno-y-Sec-Fetch-Site', async () => {
  return conServidor(async (puerto) => {
    const origen = await pedir(puerto, { ruta: '/translate?text=hola', headers: { Origin: 'https://evil.example' } });
    const rebind = await pedir(puerto, { ruta: '/translate?text=hola', host: `evil.example:${puerto}` });
    const cross = await pedir(puerto, { ruta: '/translate?text=hola', headers: { 'Sec-Fetch-Site': 'cross-site' } });
    const estado = await pedir(puerto, { ruta: '/status', headers: { Origin: 'https://evil.example' } });
    const todos = [origen, rebind, cross, estado];
    return { pass: todos.every((r) => r.status === 403 && !r.cuerpo.includes('[es]')), actual: todos.map((r) => r.status) };
  });
}, '/status incluido: un pedido ajeno no debe obtener ni una respuesta de cortesía.');

check('servidor-real-ya-no-publica-CORS-abierto', async () => {
  return conServidor(async (puerto) => {
    const normal = await pedir(puerto, { ruta: '/status' });
    const opciones = await pedir(puerto, { ruta: '/translate', metodo: 'OPTIONS' });
    const hay = (r) => Object.keys(r.headers).some((h) => h.startsWith('access-control-'));
    return { pass: !hay(normal) && !hay(opciones), actual: { normal: Object.keys(normal.headers), opciones: Object.keys(opciones.headers) } };
  });
});

check('servidor-real-el-handler-rechaza-un-par-remoto', async () => {
  // No se puede abrir una conexión "desde otro equipo" en un banco, así que
  // se le entrega al manejador REAL un pedido cuyo socket dice venir de la LAN.
  const srv = new XuatServer(pipelineFalso, 8419);
  const salidas = [];
  const res = { setHeader() {}, writeHead(c) { salidas.push(c); }, end() {} };
  const w = console.warn; console.warn = () => {};
  await srv._handleRequest({ url: '/translate?text=hola', method: 'GET', headers: { host: '192.168.1.50:8419' }, socket: { remoteAddress: '203.0.113.9' } }, res);
  console.warn = w;
  return { pass: salidas[0] === 403 && srv._requestCount === 0, actual: { codigos: salidas, traducciones: srv._requestCount } };
}, 'Además de rechazar, comprueba que NO se llegó a traducir (_requestCount queda en 0): el rechazo tiene que ocurrir antes de gastar nada.');

check('el-log-de-rechazos-tiene-tope', () => {
  const srv = new XuatServer(pipelineFalso, 8419);
  const lineas = [];
  const w = console.warn; console.warn = (m) => lineas.push(m);
  for (let i = 0; i < 50; i++) srv._logRechazo({ reason: 'par-remoto', detail: 'x' });
  console.warn = w;
  return { pass: lineas.length === 1, actual: lineas.length };
}, 'Sin tope, quien insistiera inundaría el archivo que la gente adjunta a sus reportes.');

run('XuatServer request guard bench', CHECKS);
