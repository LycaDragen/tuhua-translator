/**
 * Captura de pantalla en Linux con Wayland — v1.0.15.
 *
 * Lo reportó un usuario en CachyOS: el OCR pedía elegir pantalla EN CADA captura.
 *
 * Causa (verificada con Electron 28 real): bajo una sesión Wayland, libwebrtc
 * captura la pantalla por el portal del sistema (xdg-desktop-portal ScreenCast,
 * PipeWire), y `desktopCapturer.getSources()` abre una sesión NUEVA del portal en
 * cada llamada. Con `XDG_SESSION_TYPE=wayland` tres llamadas seguidas dieron tres
 * contactos al portal (`ScreenCastPortal failed`, porque el entorno de prueba no
 * tiene portal); en un escritorio real cada uno es un diálogo. El OCR automático
 * captura cada 3,5 s, de ahí un diálogo por captura.
 *
 * Arreglo: desactivar la captura por PipeWire de Chromium
 * (`--disable-features=WebRTCPipeWireCapturer`). `getSources()` vuelve a capturar
 * por X11/XWayland, sin diálogo: mismas 2 fuentes y 1920x1080 en ~33 ms que en una
 * sesión X11.
 *
 * Límite conocido, a propósito: por XWayland sólo se ven las ventanas X11 —los
 * juegos que corren con Proton/Wine lo son—. Un juego con ventana Wayland NATIVA
 * saldría en negro. Para ese caso queda la salida `TUHUA_CAPTURA_PORTAL=1`, que
 * deja el comportamiento anterior (el diálogo en cada captura). La solución de
 * fondo —un solo flujo de PipeWire, un solo diálogo por sesión— no se pudo
 * verificar sin un escritorio Wayland real y no se hizo.
 *
 * Sólo toca Linux con sesión Wayland: en Windows, macOS y X11 no cambia nada.
 */
const FEATURE = 'WebRTCPipeWireCapturer';

/**
 * Decide si hay que apagar la captura por PipeWire. Pura: recibe el entorno.
 * Refleja lo que hace libwebrtc, que elige el portal según XDG_SESSION_TYPE.
 */
function decidirCapturaLinux({ platform = process.platform, env = process.env } = {}) {
  if (platform !== 'linux') return { aplicar: false, motivo: 'no-linux' };
  const sesion = String(env.XDG_SESSION_TYPE || '').toLowerCase();
  if (!sesion.startsWith('wayland')) return { aplicar: false, motivo: 'sesion-no-wayland' };
  if (env.TUHUA_CAPTURA_PORTAL === '1') return { aplicar: false, motivo: 'portal-por-pedido' };
  return { aplicar: true, motivo: 'wayland' };
}

/**
 * Agrega la característica a `--disable-features` SIN pisar las que ya haya
 * (por ejemplo las que alguien pase por la línea de comandos). Tiene que correr
 * antes de que la app esté lista: Chromium lee el interruptor al iniciar.
 */
function aplicarCapturaX11(app) {
  const previo = app.commandLine.getSwitchValue('disable-features');
  const lista = previo ? previo.split(',').filter(Boolean) : [];
  if (!lista.includes(FEATURE)) lista.push(FEATURE);
  app.commandLine.appendSwitch('disable-features', lista.join(','));
  return lista;
}

module.exports = { decidirCapturaLinux, aplicarCapturaX11, FEATURE };
