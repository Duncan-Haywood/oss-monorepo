// The metric watch's repository, made in the browser: the same files deploy/make-watch-repo.sh writes, as a zip a
// person uploads to their own GitHub repository from the web, plus the links that add the workflow, set METRIC_CSV
// and start the first run. No terminal, no clone, and nothing passes through us: the page fetches the modules from
// the site that served it and the zip is made on the visitor's machine. MIT.
import { MODULES, TEXT_FILES, WORKFLOW, WORKFLOW_PATH } from './watch-repo-files.mjs';

let CRC_TABLE = null;
export function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const enc = new TextEncoder();
const asBytes = (data) => (typeof data === 'string' ? enc.encode(data) : data);

// A stored (uncompressed) zip: every unzip tool and every OS's "extract" reads it, and at about 400 KB compression
// is not worth a dependency. Times are fixed (1 Jan 2026), so the same inputs give the same bytes.
export function makeZip(files) {
  const DOS_TIME = 0;
  const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBytes = enc.encode(name);
    const body = asBytes(data);
    const crc = crc32(body);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, DOS_TIME, true);
    lv.setUint16(12, DOS_DATE, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, body.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, (3 << 8) | 20, true); // made by: Unix, so the mode below is read
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, DOS_TIME, true);
    cv.setUint16(14, DOS_DATE, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, body.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(38, (0o100644 << 16) >>> 0, true); // a regular file, rw-r--r--
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    locals.push(local, body);
    centrals.push(central);
    offset += local.length + body.length;
  }
  const centralSize = centrals.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + 22);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) { out.set(part, at); at += part.length; }
  return out;
}

// The rows a person pasted, as data/metric.csv. Blank input keeps the script's header-only file. A pasted table
// with no header line gets "date,value", which is what watch.mjs reads when it is told nothing else.
export function metricCsv(text) {
  const rows = String(text ?? '').replace(/\r\n?/g, '\n').split('\n').map((r) => r.replace(/\t/g, ',').trim()).filter(Boolean);
  if (rows.length === 0) return 'date,value\n';
  const first = rows[0].split(',');
  const hasHeader = first.some((cell) => cell !== '' && Number.isNaN(Number(cell)) && Number.isNaN(Date.parse(cell)));
  return `${hasHeader ? '' : 'date,value\n'}${rows.join('\n')}\n`;
}

// Every file the zip holds, in the order make-watch-repo.sh writes them. `fetchText(name)` returns a module's source;
// the page passes a fetch from its own site, the test a read from this folder. The workflow is left out: a file
// under .github/ is hidden in most file managers and is easy to miss in a drag-and-drop upload, so the page adds it
// with its own link (workflowLink) instead.
export async function watchRepoFiles(fetchText, { csv = '' } = {}) {
  const modules = await Promise.all(MODULES.map(async (name) => ({ name, data: await fetchText(name) })));
  return [
    ...modules,
    { name: 'LICENSE', data: TEXT_FILES.LICENSE },
    { name: 'package.json', data: TEXT_FILES['package.json'] },
    { name: '.gitignore', data: TEXT_FILES['.gitignore'] },
    { name: 'README.md', data: TEXT_FILES['README.md'] },
    { name: 'data/metric.csv', data: metricCsv(csv) },
  ];
}

// "owner/name", "https://github.com/owner/name", "github.com/owner/name.git" or the repository page's URL with a
// path after it, to { owner, name }; null for anything else. GitHub's own rules: owner up to 39 letters, digits or
// single hyphens; repository names letters, digits, '.', '_' and '-'.
export function parseRepo(input) {
  const s = String(input ?? '').trim().replace(/^https?:\/\//i, '').replace(/^(www\.)?github\.com\//i, '').replace(/\.git$/i, '');
  const m = s.match(/^([A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38})\/([A-Za-z0-9._-]{1,100})(?:\/.*)?$/);
  if (!m || m[2] === '.' || m[2] === '..') return null;
  return { owner: m[1], name: m[2] };
}

const base = ({ owner, name }) => `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;

// GitHub's "new file" page takes the path and the contents in the query string, so this opens its editor with the
// workflow filled in; the person reads it and presses "Commit changes". About 7 KB of URL, well inside what GitHub
// and every browser accept.
export function workflowLink(repo, branch = 'main') {
  const q = new URLSearchParams({ filename: WORKFLOW_PATH, value: WORKFLOW });
  return `${base(repo)}/new/${encodeURIComponent(branch)}?${q}`;
}
export const uploadLink = (repo, branch = 'main') => `${base(repo)}/upload/${encodeURIComponent(branch)}`;
export const variablesLink = (repo) => `${base(repo)}/settings/variables/actions/new`;
export const secretsLink = (repo) => `${base(repo)}/settings/secrets/actions/new`;
export const runLink = (repo) => `${base(repo)}/actions/workflows/watch-metric.yml`;
