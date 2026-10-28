/**
 * Navegación de las ventanas de la app — v1.0.13.
 *
 * Las ventanas de Tuhua sólo muestran páginas locales (renderer/*) y NADA en
 * el código propio navega a otro lado ni abre ventanas nuevas: no hay
 * `window.open`, ni `<a href>`, ni `target="_blank"`, ni `location.href =`,
 * ni `<webview>` (verificado con grep al escribir esto, y fijado por
 * scripts/test-renderer-security.js). Por eso cualquier intento de hacerlo es
 * inesperado por definición, y la política más simple es la correcta:
 * bloquear, y dejarlo escrito en el log.
 *
 * Por qué importa aunque hoy no haya nada que lo dispare: la ventana
 * principal tiene expuesto `window.tuhuaAPI` (ajustes y API keys vía IPC).
 * Sin esta guarda, un fallo que inyectara una navegación —o un enlace que
 * algún día alguien agregue sin pensar— cargaría contenido ajeno DENTRO de
 * una ventana con ese acceso. Electron lo recomienda explícitamente en su
 * guía de seguridad (puntos "Limit navigation" y "Disable or limit creation
 * of new windows").
 *
 * Por qué NO se abren los http(s) en el navegador del sistema, que sería lo
 * habitual: no hay ningún caso legítimo que lo necesite (los enlaces a la
 * documentación y al correo de soporte pasan por IPC con destino fijo, ver
 * open-docs-link / open-mail-link), y un renderer comprometido abriendo URLs
 * a voluntad sería una puerta en vez de una comodidad.
 *
 * Las reglas son funciones puras, sin importar `electron`, para poder
 * probarlas desde Node.
 */

/**
 * ¿Se puede navegar de `actual` a `destino`? Sólo se permite quedarse en la
 * MISMA página (recargar, o cambiar el #hash): es lo único que hace una
 * ventana de la app por su cuenta.
 *
 * @param {string} destino
 * @param {string} actual — la URL que la ventana tiene cargada ahora
 * @returns {'permitir'|'bloquear'}
 */
function decidirNavegacion(destino, actual) {
  try {
    const d = new URL(destino);
    const a = new URL(actual);
    if (d.protocol !== 'file:' || a.protocol !== 'file:') return 'bloquear';
    return decodeURIComponent(d.pathname) === decodeURIComponent(a.pathname) ? 'permitir' : 'bloquear';
  } catch (e) {
    return 'bloquear'; // URL ilegible: ante la duda, no
  }
}

/**
 * Pedido de ventana nueva (window.open, target=_blank): siempre se deniega.
 * Existe como función aparte para que la política esté escrita en un solo
 * lugar y el banco la fije.
 * @returns {'bloquear'}
 */
function decidirVentanaNueva(_destino) {
  return 'bloquear';
}

/**
 * Engancha las guardas a una BrowserWindow. Hay que llamarla para CADA
 * ventana que crea window-manager.js (lo verifica el banco, contando).
 *
 * @param {Electron.BrowserWindow} win
 * @param {{warn: Function}} [log]
 */
function endurecerVentana(win, log = console) {
  const wc = win.webContents;

  wc.setWindowOpenHandler(({ url }) => {
    log.warn(`[Seguridad] Ventana nueva bloqueada: ${String(url).slice(0, 200)}`);
    return { action: decidirVentanaNueva(url) === 'bloquear' ? 'deny' : 'allow' };
  });

  const guarda = (event, url) => {
    if (decidirNavegacion(url, wc.getURL()) === 'permitir') return;
    event.preventDefault();
    log.warn(`[Seguridad] Navegación bloqueada: ${String(url).slice(0, 200)}`);
  };
  wc.on('will-navigate', guarda);
  wc.on('will-redirect', guarda);

  // La app no usa <webview>; que nadie pueda adjuntar uno.
  wc.on('will-attach-webview', (event) => event.preventDefault());
}

module.exports = { decidirNavegacion, decidirVentanaNueva, endurecerVentana };
