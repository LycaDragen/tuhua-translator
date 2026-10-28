/**
 * Reutilizar las conexiones HTTP(S) — v1.0.14.
 *
 * Electron 28 trae Node 18, donde el agente global NO reutiliza conexiones: cada
 * llamada abre un socket nuevo y repite el saludo TCP+TLS completo antes de
 * enviar el primer byte. Node 19 lo cambió (keepAlive por defecto) y estos son
 * exactamente los valores que usa de fábrica; acá se instalan a mano.
 *
 * Por qué importa: la traducción de un texto nuevo es UNA llamada a un servicio
 * remoto (DeepL, Google, un LLM en la nube) y XUnity manda los pedidos de uno en
 * uno. Medido contra api-free.deepl.com con 8 pedidos seguidos desde Node 18:
 * ~790 ms por pedido con conexión nueva cada vez, ~245 ms reutilizándola. En
 * Windows el log mostraba ~1030 ms por texto nuevo, más de la mitad de eso era
 * saludo TLS repetido.
 *
 * Como `axios` (y todo lo demás de la app) usa el agente global sin pasarle uno
 * propio, instalarlo UNA vez cubre todos los motores, el actualizador y los
 * instaladores sin tocar ninguno.
 *
 * `timeout: 5000` NO corta pedidos en curso: sólo cierra los sockets que quedan
 * libres y sin uso, y evita reusar uno que el servidor ya cerró (la fuente de los
 * ECONNRESET ocasionales con keepAlive). Los plazos de cada pedido siguen siendo
 * los de cada llamada.
 */
const http = require('http');
const https = require('https');

const OPCIONES = Object.freeze({ keepAlive: true, scheduling: 'lifo', timeout: 5000 });

/** Idempotente: instalarlo dos veces no deja un agente anterior con sockets huérfanos. */
function instalar() {
  if (http.globalAgent.__tuhuaKeepAlive && https.globalAgent.__tuhuaKeepAlive) return false;
  const h = new http.Agent(OPCIONES);
  const s = new https.Agent(OPCIONES);
  h.__tuhuaKeepAlive = true;
  s.__tuhuaKeepAlive = true;
  http.globalAgent = h;
  https.globalAgent = s;
  return true;
}

module.exports = { instalar, OPCIONES };
