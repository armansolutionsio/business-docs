// Discos de la VM de Oracle (arman-server): el de arranque viene con la VM; los demas son block
// volumes Always Free que se enchufan aparte y se ven como una carpeta mas (mount).
//
// Por que hay dos discos (Gabo, 28/10/2026): Oracle da hasta 200 GB de block storage por cuenta en
// Always Free y la VM usaba 150. Los 50 restantes se crearon como un disco aparte (block volume
// "arman-video", paravirtualizado, /dev/sdb, XFS con label arman-video) montado por UUID en
// /etc/fstab con defaults,_netdev,nofail (el fstab anterior quedo en /etc/fstab.antes-arman-video).
// Esta separado a proposito: el video de CASE LAND (volumen Docker xpg3o365omuzuouv34uwablp_datos)
// es lo unico que se llena y se vacia todos los dias; si lo llena, falla solo esa bajada y no el
// sistema, las bases ni este panel. Agrandar el disco del sistema seria mas delicado. En el servidor
// se ve con `lsblk` y `df -h /mnt/arman-video`. El disco de 150 (sda) tiene la raiz en un LVM de
// Oracle Linux (133 GB) mas /boot y /var/oled, por eso el panel muestra menos que 150.
//
// Lo descriptivo (nombre y que guarda, una linea) se carga aca a mano. Tamano y uso se
// miden siempre: el tamano del disco sale de /sys/block (lsblk por SSH) y el uso de statfs sobre el
// mount (findmnt por SSH). Para medir un mount distinto de la raiz, el contenedor tiene que verlo
// en la misma ruta: en Coolify, Storages de business-docs con Source Path = Destination Path.
// Si no lo ve, se informa el tamano y el uso queda "sin datos" con el motivo.

const fs = require('fs');

const DISKS = [
  {
    key: 'system',
    label: 'Disco del sistema',
    device: 'sda',
    mount: '/',
    holds: 'Sistema, Docker, aplicaciones y bases de datos.',
  },
  {
    key: 'arman-video',
    label: 'arman-video',
    device: 'sdb',
    mount: '/mnt/arman-video',
    holds: 'Video de CASE LAND (volumen xpg3o365omuzuouv34uwablp_datos).',
  },
];

const MAX_FOLDERS = 10;

const notVisible = (mount) =>
  `El contenedor de business-docs no ve ${mount}. En Coolify → business-docs → Storages agregá un Volume Mount con Source Path y Destination Path ${mount} y redeployá.`;

// Tabla de mounts del contenedor: { '/mnt/arman-video': { source, fstype, opts } }.
function readMountTable() {
  const out = {};
  try {
    for (const line of fs.readFileSync('/proc/self/mounts', 'utf8').split('\n')) {
      const [source, target, fstype, opts] = line.split(' ');
      if (target) out[target] = { source, fstype, opts };
    }
  } catch (e) {
    // fuera de Linux (dev local) no hay /proc
  }
  return out;
}

function usage(path) {
  const s = fs.statfsSync(path);
  return { total: s.blocks * s.bsize, used: (s.blocks - s.bfree) * s.bsize, free: s.bavail * s.bsize };
}

function listFolders(path) {
  try {
    return fs.readdirSync(path, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name).sort().slice(0, MAX_FOLDERS);
  } catch (e) {
    return [];
  }
}

const deviceOf = (source, fallback) => (source && source.startsWith('/dev/') ? source.slice(5) : fallback);

// Si la carpeta existe pero el disco no esta montado, statfs devuelve los numeros de la raiz.
const sameAsRoot = (u, root) => root.total && u.total === root.total && u.free === root.free;

// Agrega el tamano fisico (de /sys/block o lsblk) y lista los discos que nadie describio.
function assemble(blockDevices, disks) {
  const sizes = Object.fromEntries((blockDevices || []).map((b) => [b.name, b.size]));
  const known = new Set(disks.map((d) => d.device));
  const out = disks.map((d) => ({ ...d, size: sizes[d.device] ?? null }));
  for (const b of blockDevices || []) {
    if (!known.has(b.name)) {
      out.push({ key: b.name, label: b.name, device: b.name, size: b.size, mount: null, mounted: false,
        reason: 'Disco sin describir: falta agregarlo en utils/infraDisks.js.' });
    }
  }
  return out;
}

// Modo contenedor. `root` = { total, used, free } de / ya leido; `blockDevices` viene de /sys/block.
function readDisks(root, blockDevices) {
  const mounts = readMountTable();
  return assemble(blockDevices, DISKS.map((d) => {
    if (d.mount === '/') return { ...d, ...root, mounted: !!root.total };
    const m = mounts[d.mount];
    if (!m) return { ...d, mounted: false, reason: notVisible(d.mount) };
    try {
      const u = usage(d.mount);
      if (sameAsRoot(u, root)) {
        return { ...d, mounted: false, reason: `${d.mount} existe pero el disco no está montado en el servidor (los números son los de la raíz).` };
      }
      return { ...d, ...u, mounted: true, fstype: m.fstype, device: deviceOf(m.source, d.device),
        readOnly: /(^|,)ro(,|$)/.test(m.opts || ''), folders: listFolders(d.mount) };
    } catch (e) {
      return { ...d, mounted: false, reason: e.message };
    }
  }));
}

// Modo SSH (desarrollo): por cada disco con mount propio, una linea MOUNT, la salida de findmnt
// (vacia si no esta montado) y una linea DIRS con sus carpetas.
const sshCommands = () => DISKS.filter((d) => d.mount !== '/').flatMap((d) => [
  `echo "MOUNT ${d.mount}"`,
  `findmnt -bno SOURCE,FSTYPE,SIZE,USED,AVAIL ${d.mount}`,
  `echo "DIRS $(ls -1p ${d.mount} 2>/dev/null | grep "/$" | tr -d / | head -${MAX_FOLDERS} | paste -sd,)"`,
]);

function parseSsh(text, root, blockDevices) {
  const found = {};
  let cur = null;
  for (const raw of (text || '').split('\n')) {
    const line = raw.trim();
    if (line.startsWith('MOUNT ')) cur = found[line.slice(6)] = {};
    else if (line.startsWith('DIRS ') && cur) cur.folders = line.slice(5).split(',').map((s) => s.trim()).filter(Boolean);
    else if (line && cur) {
      const [source, fstype, size, used, avail] = line.split(/\s+/);
      Object.assign(cur, { source, fstype, total: Number(size), used: Number(used), free: Number(avail) });
    }
  }
  return assemble(blockDevices, DISKS.map((d) => {
    if (d.mount === '/') return { ...d, ...root, mounted: !!root.total };
    const m = found[d.mount];
    if (!m || !m.total) return { ...d, mounted: false, reason: `${d.mount} no está montado en el servidor.` };
    return { ...d, total: m.total, used: m.used, free: m.free, mounted: true, fstype: m.fstype,
      device: deviceOf(m.source, d.device), folders: m.folders || [] };
  }));
}

module.exports = { DISKS, readDisks, sshCommands, parseSsh };
