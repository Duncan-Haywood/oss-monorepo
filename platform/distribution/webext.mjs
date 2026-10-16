/**
 * Browser-extension packager: turns a venture's static page into a Manifest V3
 * extension (Chrome Web Store, Edge Add-ons, Firefox AMO accept the same
 * package shape) that opens the tool offline in a tab from the toolbar. Off by
 * default; this builds the artifact only. Uploading to a store is the owner's
 * step (a developer account, a one-time fee, the store's terms).
 * See portfolio/distribution/README.md.
 *
 *   node platform/distribution/webext.mjs                         # dry run: counts and lists qualifying tools
 *   node platform/distribution/webext.mjs --build <slug> <outDir> # writes <outDir>/<slug>/ and <outDir>/<slug>.zip
 *
 * MV3 pages may not run inline scripts, so each inline <script> is moved to a
 * file of its own. A page that uses inline event handlers or javascript: URLs,
 * loads code from another origin, or reaches the network is skipped, not
 * guessed at. The package asks for no permissions and bundles no remote code.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { importsOf } from './npm.mjs';
import { readMeta, toolUrl } from './bluesky.mjs';
import { renderIcon } from '../pages/offline.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
export const VERSION = '0.1.0';
const REPO_URL = 'https://github.com/duncan-haywood/oss-monorepo';
const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const NETWORK_RE = /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts|\bimport\s*\(/;

/** Names Chrome shows: the title up to its first dash, at most 45 characters. */
export function extensionName(title) {
  const head = title.split(/\s[—–-]\s/)[0].trim();
  return head.length <= 45 ? head : `${head.slice(0, 44).trimEnd()}…`;
}

/** Chrome limits the description to 132 characters. */
export function clipDescription(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= 132 ? t : `${t.slice(0, 131).trimEnd()}…`;
}

/**
 * Rewrites the page for MV3. Returns { html, scripts: {file: source}, skip }.
 * ld+json blocks are data, not code, and stay inline.
 */
export function rewritePage(html) {
  if (/\son[a-z]+\s*=\s*["']|javascript:/i.test(html.replace(SCRIPT_RE, ''))) return { skip: 'inline event handlers or javascript: URLs' };
  if (/(?:src|href)\s*=\s*["']\/\//i.test(html) || /<(?:script|link)\b[^>]*(?:src|href)\s*=\s*["']https?:/i.test(html)) return { skip: 'loads a file from another origin' };
  const scripts = {};
  let n = 0;
  let skip = null;
  const out = html.replace(SCRIPT_RE, (whole, attrs, body) => {
    if (/type\s*=\s*["']application\/ld\+json["']/i.test(attrs)) return whole;
    if (/\bsrc\s*=/i.test(attrs)) return whole;
    if (!body.trim()) return whole;
    if (NETWORK_RE.test(body)) { skip = 'inline script reaches the network'; return whole; }
    n += 1;
    const file = `inline-${n}.js`;
    scripts[file] = `${body.trim()}\n`;
    const module = /type\s*=\s*["']module["']/i.test(attrs) ? ' type="module"' : '';
    return `<script${module} src="${file}"></script>`;
  });
  return skip ? { skip } : { html: out, scripts };
}

/** Local files the page's scripts import, transitively; { skip } on a package or escape. */
export async function importedFiles(dir, sources) {
  const seen = new Set();
  const queue = [];
  const enqueue = (src, fromRel) => {
    for (const spec of importsOf(src)) {
      if (!spec.startsWith('./') && !spec.startsWith('../')) return `imports "${spec}"`;
      const next = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec));
      if (next.startsWith('..')) return `imports outside its directory (${spec})`;
      queue.push(next);
    }
    return null;
  };
  for (const s of sources) { const r = enqueue(s, 'index.html'); if (r) return { skip: r }; }
  while (queue.length) {
    const rel = queue.pop();
    if (seen.has(rel)) continue;
    seen.add(rel);
    const src = await fs.readFile(path.join(dir, rel), 'utf8').catch(() => null);
    if (src === null) return { skip: `missing ${rel}` };
    if (NETWORK_RE.test(src)) return { skip: `${rel} reaches the network` };
    const r = enqueue(src, rel);
    if (r) return { skip: r };
  }
  return { files: [...seen].sort() };
}

export const BACKGROUND = `chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
});
`;

const ICON_SIZES = [16, 48, 128];

/** One extension as { name, version, files: {path: string|Buffer} } or { skip }. */
export async function buildExtension({ slug, dir, version = VERSION }) {
  const html = await fs.readFile(path.join(dir, 'index.html'), 'utf8').catch(() => null);
  if (html === null) return { skip: 'no index.html' };
  const meta = readMeta(html);
  if (!meta) return { skip: 'no title or description' };
  const license = await fs.readFile(path.join(dir, 'LICENSE'), 'utf8').catch(() => null);
  if (license === null || !/MIT License/i.test(license)) return { skip: 'no MIT LICENSE' };
  const page = rewritePage(html);
  if (page.skip) return { skip: page.skip };
  const localSrc = [...html.matchAll(SCRIPT_RE)].map((m) => /\bsrc\s*=\s*["']([^"']+)["']/i.exec(m[1])?.[1]).filter(Boolean);
  const sources = Object.values(page.scripts);
  for (const s of localSrc) {
    if (!s.startsWith('./') && !/^[\w-]+\.m?js$/.test(s)) return { skip: `script src ${s}` };
    const rel = s.replace(/^\.\//, '');
    const body = await fs.readFile(path.join(dir, rel), 'utf8').catch(() => null);
    if (body === null) return { skip: `missing ${rel}` };
    if (NETWORK_RE.test(body)) return { skip: `${rel} reaches the network` };
    sources.push(body);
  }
  const imp = await importedFiles(dir, sources);
  if (imp.skip) return { skip: imp.skip };
  const files = { 'index.html': page.html };
  for (const [f, s] of Object.entries(page.scripts)) files[f] = s;
  for (const s of localSrc) { const rel = s.replace(/^\.\//, ''); files[rel] = await fs.readFile(path.join(dir, rel), 'utf8'); }
  for (const rel of imp.files) files[rel] = await fs.readFile(path.join(dir, rel), 'utf8');
  files['background.js'] = BACKGROUND;
  files.LICENSE = license;
  const name = extensionName(meta.title);
  const icons = {};
  for (const size of ICON_SIZES) { files[`icons/${size}.png`] = renderIcon({ size }); icons[size] = `icons/${size}.png`; }
  files['manifest.json'] = `${JSON.stringify({
    manifest_version: 3,
    name,
    version,
    description: clipDescription(meta.description),
    icons,
    action: { default_title: `Open ${name}`, default_icon: icons },
    background: { service_worker: 'background.js' },
    homepage_url: toolUrl(slug),
  }, null, 2)}\n`;
  files['README.md'] = `# ${name} (browser extension)\n\n${meta.description}\n\nClick the toolbar icon to open the tool in a tab. It runs offline, asks for no permissions and sends nothing anywhere.\n\nFree and open source (MIT). Web version: ${toolUrl(slug)}\nSource: ${REPO_URL}/tree/main/ventures/${slug}\n\nNo warranty; an aid, not legal, tax or professional advice.\n`;
  return { name, version, files };
}

// --- zip (stored/deflated, no dependencies) --------------------------------
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A deterministic zip of { path: string|Buffer } (fixed timestamp, sorted paths). */
export function zip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const name of Object.keys(files).sort()) {
    const raw = Buffer.from(files[name]);
    const data = zlib.deflateRawSync(raw, { level: 9 });
    const nameBuf = Buffer.from(name);
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8); local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    parts.push(local, nameBuf, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(8, 10); c.writeUInt16LE(0, 12); c.writeUInt16LE(0x21, 14);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24);
    c.writeUInt16LE(nameBuf.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

export async function discover(root = REPO_ROOT) {
  const dir = path.join(root, 'ventures');
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory() && await fs.stat(path.join(dir, e.name, 'index.html')).then(() => true, () => false)) out.push(e.name);
  }
  return out.sort();
}

export async function plan({ root = REPO_ROOT, slugs } = {}) {
  const ok = [];
  const skipped = [];
  for (const slug of slugs ?? await discover(root)) {
    const r = await buildExtension({ slug, dir: path.join(root, 'ventures', slug) });
    if (r.skip) skipped.push({ slug, reason: r.skip }); else ok.push({ slug, name: r.name });
  }
  return { ok, skipped };
}

export async function writeExtension(slug, ext, outDir) {
  const base = path.join(outDir, slug);
  for (const [rel, body] of Object.entries(ext.files)) {
    await fs.mkdir(path.dirname(path.join(base, rel)), { recursive: true });
    await fs.writeFile(path.join(base, rel), body);
  }
  await fs.writeFile(`${base}.zip`, zip(ext.files));
  return base;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] === '--build') {
    const [, slug, outDir] = args;
    if (!slug || !outDir) { console.error('usage: webext.mjs --build <slug> <outDir>'); process.exit(2); }
    const ext = await buildExtension({ slug, dir: path.join(REPO_ROOT, 'ventures', slug) });
    if (ext.skip) { console.error(`${slug}: skipped (${ext.skip})`); process.exit(1); }
    console.log(`wrote ${await writeExtension(slug, ext, outDir)} (+ .zip, ${Object.keys(ext.files).length} files)`);
  } else {
    const { ok, skipped } = await plan();
    const reasons = {};
    for (const s of skipped) reasons[s.reason.replace(/"[^"]*"|\S+\.m?js/g, '…')] = (reasons[s.reason.replace(/"[^"]*"|\S+\.m?js/g, '…')] ?? 0) + 1;
    console.log(`${ok.length} of ${ok.length + skipped.length} ventures qualify as browser extensions`);
    for (const [r, n] of Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`  skipped ${n}: ${r}`);
  }
}
