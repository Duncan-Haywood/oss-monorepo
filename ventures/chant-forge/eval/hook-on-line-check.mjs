// node eval/hook-on-line-check.mjs [--cache DIR] [--out FILE] MANIFEST.json...
//
// The hook-on-line rule (scan.mjs liquescentTail, LIQ.onLine;
// eval/hook-on-line-check.md) read both ways on the piece lists given (in
// scan-pages.json's format): every page with readPage as on main, and with
// { hookOnLine: false }, the reader before 2026-11-16. For each list:
// notes agreeing with the GABC, differing, GABC only and scan only (as in
// scan-check.mjs); GABC liquescents whose small note is on a staff line
// (d f h j) and the rest, each counted as read when the alignment pairs it
// with a scan liquescent at its pitch; heads the reader calls liquescent that
// pair with a GABC note of another shape; and every scan note the rule moved
// or added, with its page, staff and x and the GABC note it pairs with.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { readPage, gabcSteps, align, alignLocal } from '../scan.mjs';
import { scanCache } from './scan-cache.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const cache = opt('--cache', join(tmpdir(), 'chant-forge-scans'));
const out = opt('--out', join(here, 'hook-on-line-report.md'));
const manifests = args.filter((a, i) => a.endsWith('.json') && args[i - 1] !== '--out');
mkdirSync(cache, { recursive: true });
const { page, prefetch } = scanCache(cache);
const NAMES = 'abcdefghijklm';

const lists = manifests.map((f) => ({ file: f, pieces: JSON.parse(readFileSync(f, 'utf8')).pieces }));
await prefetch(lists.flatMap((l) => l.pieces.flatMap((p) => p.pages.map((pg) => [p.archive, pg.leaf]))));

function readPiece(piece, opts) {
  const src = readFileSync(join(root, piece.gabc), 'utf8');
  const g = gabcSteps(src);
  let clefLine = piece.clefLine;
  if (clefLine === undefined) { const c = /\(([cf])b?([1-4])\)/.exec(src.slice(src.indexOf('%%'))); clefLine = 3 + 2 * (Number(c[2]) - 1); }
  const scan = [];
  for (const p of piece.pages) {
    const staves = readPage(page(piece.archive, p.leaf), opts);
    const [from, to] = p.staves || [1, staves.length];
    for (const s of staves.slice(from - 1, to)) for (const n of s.notes) if (n.rel !== null) scan.push({ ...n, page: p.page, leaf: p.leaf, staff: s.staff });
  }
  const r = (piece.local ? alignLocal : align)(scan.map((n) => n.rel), g.map((n) => n.rel));
  const pairOfScan = new Map(), pairOfGabc = new Map();
  for (const [p, q] of r.pairs) { if (p !== null) pairOfScan.set(p, q); if (q !== null) pairOfGabc.set(q, p); }
  const letter = (q) => NAMES[g[q].rel + (g[q].clefLine ?? clefLine)];
  const c = { match: r.match, sub: r.sub, gabcOnly: r.gabcOnly, scanOnly: r.scanOnly, lineLiq: 0, lineLiqRead: 0, otherLiq: 0, otherLiqRead: 0, falseLiq: 0 };
  g.forEach((n, q) => {
    if (q < r.startJ || q >= r.endJ || n.shape !== 'liquescent') return;
    const onLine = 'dfhj'.includes(letter(q));
    const p = pairOfGabc.get(q);
    const ok = p !== undefined && p !== null && scan[p].rel === n.rel && scan[p].shape === 'liquescent';
    if (onLine) { c.lineLiq++; if (ok) c.lineLiqRead++; } else { c.otherLiq++; if (ok) c.otherLiqRead++; }
  });
  scan.forEach((n, p) => {
    const q = pairOfScan.get(p);
    if (n.shape === 'liquescent' && q !== undefined && q !== null && g[q].shape !== 'liquescent') c.falseLiq++;
  });
  return { g, scan, pairOfScan, letter, clefLine, c };
}

const lines = ['# The hook-on-line rule, read both ways', '', 'Written by `node eval/hook-on-line-check.mjs` (scan reader: `scan.mjs`; the rule is `LIQ.onLine` in',
  '`liquescentTail`, off with `readPage(img, { hookOnLine: false })`). "On-line liquescents" are GABC liquescents',
  'whose small note is d, f, h or j (a staff line); one is "read" when the alignment pairs it with a scan',
  'liquescent at its pitch. "False liquescents" are scan liquescents paired with a GABC note of another shape.', '',
  '| list | pieces | agree (before / after) | differ | GABC only | scan only | on-line liquescents read | other liquescents read | false liquescents |',
  '|---|---|---|---|---|---|---|---|---|'];
const changes = [];
const total = { before: null, after: null };
for (const l of lists) {
  const sum = { before: {}, after: {} };
  for (const piece of l.pieces) {
    const b = readPiece(piece, { hookOnLine: false });
    const a = readPiece(piece, {});
    for (const [k, v] of [['before', b], ['after', a]]) for (const [f, n] of Object.entries(v.c)) sum[k][f] = (sum[k][f] || 0) + n;
    // scan notes the rule moved or added: matched by page, staff, x and kind
    const key = (n) => `${n.leaf}/${n.staff}/${n.x}/${n.shape === 'liquescent'}`;
    const before = new Map(b.scan.map((n, p) => [key(n), p]));
    const after = new Map(a.scan.map((n, p) => [key(n), p]));
    const name = (v, p) => {
      const q = v.pairOfScan.get(p);
      return q === undefined || q === null ? 'no GABC note' : `${v.letter(q)}${v.g[q].shape === 'liquescent' ? '~' : ''} (${v.g[q].text || '?'} \`${v.g[q].group}\`)`;
    };
    const say = (v, p) => (p === undefined ? 'not read' : `${NAMES[v.scan[p].rel + v.clefLine] ?? v.scan[p].rel}${v.scan[p].shape === 'liquescent' ? '~' : ''} → ${name(v, p)}`);
    for (const k of new Set([...before.keys(), ...after.keys()])) {
      const pb = before.get(k), pa = after.get(k);
      if (pb !== undefined && pa !== undefined && b.scan[pb].rel === a.scan[pa].rel) continue;
      const n = (pa !== undefined ? a.scan[pa] : b.scan[pb]);
      changes.push(`| ${basename(l.file)} | ${piece.name} | leaf ${n.leaf}, staff ${n.staff}, x ${n.x} | ${say(b, pb)} | ${say(a, pa)} |`);
    }
  }
  const f = (k) => `${sum.before[k]} / ${sum.after[k]}`;
  lines.push(`| ${basename(l.file)} | ${l.pieces.length} | ${f('match')} | ${f('sub')} | ${f('gabcOnly')} | ${f('scanOnly')} | ${sum.before.lineLiqRead} / ${sum.after.lineLiqRead} of ${sum.after.lineLiq} | ${sum.before.otherLiqRead} / ${sum.after.otherLiqRead} of ${sum.after.otherLiq} | ${f('falseLiq')} |`);
  for (const k of ['before', 'after']) { total[k] ??= {}; for (const [x, n] of Object.entries(sum[k])) total[k][x] = (total[k][x] || 0) + n; }
}
if (lists.length > 1) {
  const f = (k) => `${total.before[k]} / ${total.after[k]}`;
  lines.push(`| all | ${lists.reduce((s, l) => s + l.pieces.length, 0)} | ${f('match')} | ${f('sub')} | ${f('gabcOnly')} | ${f('scanOnly')} | ${total.before.lineLiqRead} / ${total.after.lineLiqRead} of ${total.after.lineLiq} | ${total.before.otherLiqRead} / ${total.after.otherLiqRead} of ${total.after.otherLiq} | ${f('falseLiq')} |`);
}
lines.push('', '## Every scan note the rule moved, added or removed', '', 'Scan note → the GABC note the alignment pairs it with (`~` = liquescent).', '');
if (changes.length) lines.push('| list | piece | where | before | after |', '|---|---|---|---|---|', ...changes);
else lines.push('None.');
writeFileSync(out, lines.join('\n') + '\n');
console.log(lines.filter((x) => x.startsWith('|')).slice(0, 2 + lists.length + 1).join('\n'));
console.log(`${changes.length} scan notes changed; report ${out}`);
