/**
 * Extracción de zips con PowerShell (xuat-installer.js) — bench de v1.0.13.
 *
 * Una auditoría de seguridad señaló que `_extractZip` armaba el comando así:
 *
 *   Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force
 *
 * duplicando sólo la comilla simple ASCII. PowerShell trata como comilla
 * simple también ‘ ’ ‚ ‛ (U+2018..U+201B), de modo que una ruta con una de
 * ellas —un usuario de Windows llamado "D’Angelo"— cerraba la cadena antes de
 * tiempo. Reproducido contra PowerShell real, el resultado con el código
 * viejo no era sólo un fallo de extracción: PowerShell ejecutaba lo que
 * seguía a la comilla como un comando (`New-Item : No se encuentra la unidad
 * 'Angelo\prueba.zip -DestinationPa…'`).
 *
 * Cosas que conviene tener claras sobre el alcance real:
 *  - Las rutas que llegan a esa función salen de `os.tmpdir()` más nombres
 *    fijos (`BepInEx5.zip`), NO de la carpeta del juego. El "vector" es el
 *    nombre de usuario de Windows de quien instala, no un atacante remoto.
 *  - Aun así, un usuario con ’ en su nombre no podía instalar XUAT. Era un
 *    bug funcional antes que de seguridad.
 *
 * Tres capas:
 *  1. Pura: el texto del comando NO depende de las rutas. Si no depende, no
 *     hay nada que inyectar — y es una propiedad verificable sin PowerShell.
 *  2. Estática: `_extractZip` no vuelve a usar exec/execSync con plantillas.
 *  3. Real: se corre PowerShell de verdad con rutas hostiles. Sólo se ejecuta
 *     donde hay `powershell.exe` (Windows, o WSL con interop); en cualquier
 *     otro lado se omite y lo dice.
 *
 * LIMITACIÓN CONOCIDA, a propósito fuera del banco: `Expand-Archive` falla si
 * la carpeta de DESTINO contiene `[` o `]` (los trata como comodín en una
 * comprobación interna; -LiteralPath sólo cubre el zip de origen). No es un
 * caso práctico: Windows no permite esos caracteres en nombres de cuenta, así
 * que sólo aparecería con un %TEMP% personalizado a mano. Ya fallaba antes de
 * v1.0.13 y sigue igual.
 *
 *   node scripts/test-xuat-extract.js
 *   node scripts/test-xuat-extract.js --quiet
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, spawnSync, execFileSync } = require('child_process');

const XuatInstaller = require(path.join('..', 'src', 'services', 'xuat-installer.js'));
const { makeCheckRegistry, run } = require('./lib/bench.js');
const { check, CHECKS } = makeCheckRegistry();

const instaladorSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'xuat-installer.js'), 'utf8');

const HOSTILES = [
  "L'été d'O'Brien",
  'D’Angelo',
  'x‘y’z‚w‛v',
  'a & b $HOME ; c `d` %PATH%',
  "x'; New-Item PWNED -ItemType File; '",
  'C:\\Users\\sebag\\AppData\\Local\\Temp\\tuhua-xuat-1\\BepInEx5.zip'
];

// ─── 1. Pura ─────────────────────────────────────────────────────────────
check('el-texto-del-comando-no-depende-de-las-rutas', () => {
  const base = JSON.stringify(XuatInstaller.buildExtractInvocation('a.zip', 'dest').args);
  const distintos = HOSTILES.filter((h) => JSON.stringify(XuatInstaller.buildExtractInvocation(h, h).args) !== base);
  return { pass: distintos.length === 0, actual: distintos };
}, 'Si los argumentos son idénticos para cualquier ruta, ninguna ruta puede alterar lo que PowerShell ejecuta. Es la propiedad que reemplaza a "escapar bien".');

check('las-rutas-viajan-intactas-por-variables-de-entorno', () => {
  const malos = HOSTILES.filter((h) => {
    const inv = XuatInstaller.buildExtractInvocation(h, h + 'x');
    return inv.env.TUHUA_ZIP !== h || inv.env.TUHUA_DEST !== h + 'x';
  });
  return { pass: malos.length === 0, actual: malos };
});

check('usa-LiteralPath-para-el-zip-y-falla-ruidosamente', () => {
  const cmd = XuatInstaller.buildExtractInvocation('a', 'b').args.join(' ');
  return {
    pass: /-LiteralPath \$env:TUHUA_ZIP/.test(cmd) && /ErrorActionPreference\s*=\s*'Stop'/.test(cmd) && !/ -Path /.test(cmd),
    actual: cmd
  };
}, "-Path interpreta [ ] como comodines; sin ErrorActionPreference=Stop, Expand-Archive reporta algunos fallos como no terminantes y el proceso sale con código 0 sin haber extraído nada.");

// ─── 2. Estática ─────────────────────────────────────────────────────────
check('_extractZip-ya-no-interpola-rutas-en-un-comando', () => {
  const cuerpo = instaladorSrc.slice(instaladorSrc.indexOf('async _extractZip('), instaladorSrc.indexOf('_getTempDir() {'));
  const usaExecSync = /execSync\s*\(/.test(cuerpo);
  const interpola = /\$\{\s*(zipPath|destDir)/.test(cuerpo);
  const usaExecFile = /execFile\s*\(/.test(cuerpo);
  return { pass: !usaExecSync && !interpola && usaExecFile, actual: { usaExecSync, interpola, usaExecFile } };
}, 'Si alguien vuelve a armar el comando con una plantilla, este check falla antes de que el bug llegue a un usuario con un apóstrofo en el nombre.');

// ─── 3. Real ─────────────────────────────────────────────────────────────
/** ¿Hay un PowerShell de Windows al que llamar? (Windows nativo o WSL con interop) */
function hayPowerShell() {
  try {
    const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'exit 0'], { timeout: 20000 });
    return r.status === 0;
  } catch (e) { return false; }
}

/** Carpeta temporal visible desde Windows, y cómo convertir rutas hacia PowerShell. */
function entornoWindows() {
  if (process.platform === 'win32') return { base: path.join(os.tmpdir(), 'tuhua-seg-test'), aWin: (p) => p, wsl: false };
  const tmpWin = spawnSync('cmd.exe', ['/c', 'echo %TEMP%'], { encoding: 'utf8' }).stdout.trim().replace(/\r/g, '');
  const tmpLinux = spawnSync('wslpath', ['-u', tmpWin], { encoding: 'utf8' }).stdout.trim();
  return {
    base: path.join(tmpLinux, 'tuhua-seg-test'),
    aWin: (p) => spawnSync('wslpath', ['-w', p], { encoding: 'utf8' }).stdout.trim(),
    wsl: true
  };
}

check('PowerShell-real-extrae-con-rutas-hostiles-y-no-ejecuta-nada', async () => {
  if (!hayPowerShell()) {
    return { pass: true, actual: 'OMITIDO: no hay powershell.exe en este entorno (Windows o WSL con interop)' };
  }
  const ent = entornoWindows();
  fs.rmSync(ent.base, { recursive: true, force: true });
  fs.mkdirSync(ent.base, { recursive: true });

  const fallos = [];
  const casos = ['carpeta normal', "L'été d'O'Brien", 'D’Angelo', 'x‘y’z‚w‛v', 'a & b $HOME ; c `d` %PATH%',
    "x'; New-Item -Path PWNED -ItemType File; '"];
  for (const nombre of casos) {
    const dir = path.join(ent.base, nombre);
    fs.mkdirSync(dir, { recursive: true });
    const zip = path.join(dir, 'prueba.zip');
    execFileSync('python3', ['-c', "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],'w'); z.writestr('dentro/hola.txt','ok'); z.close()", zip]);
    const dest = path.join(dir, 'salida');
    fs.mkdirSync(dest, { recursive: true });

    const inv = XuatInstaller.buildExtractInvocation(ent.aWin(zip), ent.aWin(dest));
    const env = { ...process.env, ...inv.env };
    if (ent.wsl) env.WSLENV = 'TUHUA_ZIP:TUHUA_DEST'; // en WSL las variables no cruzan solas hacia un .exe de Windows
    const ok = await new Promise((resolve) => execFile(inv.file, inv.args, { env, timeout: 60000 }, (err) => resolve(!err)));
    if (!ok || !fs.existsSync(path.join(dest, 'dentro', 'hola.txt'))) fallos.push(nombre);
  }

  // ¿se ejecutó el payload de la "inyección clásica" en alguna parte?
  const payloadEjecutado = [];
  (function buscar(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'PWNED') payloadEjecutado.push(path.join(d, e.name));
      if (e.isDirectory()) buscar(path.join(d, e.name));
    }
  })(ent.base);

  fs.rmSync(ent.base, { recursive: true, force: true });
  return { pass: fallos.length === 0 && payloadEjecutado.length === 0, actual: { fallos, payloadEjecutado } };
}, 'Con el código anterior, los casos con ’ y ‘’‚‛ fallaban (y PowerShell interpretaba el resto de la ruta como comandos). Este check los ejercita contra un PowerShell de verdad.');

run('xuat-installer _extractZip bench', CHECKS);
