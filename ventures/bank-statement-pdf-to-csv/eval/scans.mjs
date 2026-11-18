// Scanned statements, end to end, through the same code the page runs:
// made-up statements in three layouts are drawn as HTML in headless Chromium,
// photographed at scan resolution, degraded like a desk scan (skew, noise,
// blur, JPEG quality 40-85), wrapped as an image-only PDF, and read back:
// pageImages (ocr.mjs) takes the JPEG out of the PDF, tesseract 5 (the engine
// tesseract.js compiles to WebAssembly) reads its word boxes, linesFromWords
// keeps the columns, and parseStatement reads the rows, with and without
// { ocr: true } (the balance-checked repair).
//
// A quarter of the statements also lose one row from the picture (the line
// painted over, as a fold or smudge would) while the printed balances stay:
// the right answer there is a balance break the page reports, never a silent
// "repair" that hides the missing row.
//
//   node eval/scans.mjs [--n 36] [--seed 11] [--keep DIR] [--json]
//
// Synthetic, seeded statements typeset in two fonts: this measures the route
// and the checks, not accuracy on any real bank's scan. Exit 0 with "skipped"
// when playwright, tesseract or ImageMagick is missing.
import { existsSync, mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const { pageImages, wordsFromTsv, linesFromWords } = await import(join(here, '..', 'ocr.mjs'));
const { parseStatement } = await import(join(here, '..', 'calc.mjs'));

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const N = +arg('--n', 36), SEED = +arg('--seed', 11), KEEP = arg('--keep', null), JSON_OUT = process.argv.includes('--json');
for (const [cmd, a] of [['tesseract', ['--version']], ['convert', ['-version']]]) {
  if (spawnSync(cmd, a).error) { console.log(`skipped: ${cmd} not installed`); process.exit(0); }
}
// playwright from the project, or the global install (npm root -g)
let chromium;
const req = createRequire(import.meta.url);
for (const name of ['playwright', join(spawnSync('npm', ['root', '-g'], { encoding: 'utf8' }).stdout.trim(), 'playwright')]) {
  try { ({ chromium } = req(name)); break; } catch {}
}
if (!chromium) { console.log('skipped: playwright not installed'); process.exit(0); }

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const OUT = ['CORNER HARDWARE 112', 'BLUE DOOR COFFEE', 'CITY WATER UTIL', 'ACME OFFICE SUPPLY', 'NORTHSIDE FUEL 0447', 'PRINT SHOP ON MAIN', 'METRO TRANSIT', 'WEBHOST MONTHLY', 'PARCEL EXPRESS', 'GREEN LEAF CATERING', 'SUNRISE INSURANCE', 'VALLEY PHONE SVC', 'LAKESIDE RENT LLC', 'TOOL DEPOT 2291', 'CARD PURCHASE DELI', 'SERVICE CHARGE', 'CHEQUE 100431', 'ATM WITHDRAWAL'];
const IN = ['DEPOSIT', 'MOBILE DEPOSIT', 'CLIENT PAYMENT', 'STRIPE TRANSFER', 'SQUARE DEPOSIT', 'TRANSFER FROM SAVINGS', 'INTEREST PAID'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const money = (c) => (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function makeStatement(r, k) {
  const layout = ['us', 'split', 'uk'][k % 3];
  const month = Math.floor(r() * 12), year = 2026;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const n = 10 + Math.floor(r() * 26);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const inflow = r() < 0.28;
    const mag = Math.round((inflow ? 150 + r() * 5000 : 2 + r() * (r() < 0.2 ? 3500 : 280)) * 100);
    rows.push({ day: 1 + Math.floor(r() * days), desc: (inflow ? IN : OUT)[Math.floor(r() * (inflow ? IN : OUT).length)], cents: inflow ? mag : -mag });
  }
  rows.sort((a, b) => a.day - b.day);
  let bal = Math.round((800 + r() * 9000) * 100);
  const opening = bal;
  for (const x of rows) { bal += x.cents; x.balance = bal; }
  const lose = r() < 0.25 ? 1 + Math.floor(r() * (n - 2)) : -1; // never the first or last row
  const font = r() < 0.5 ? 'Arial, Helvetica, sans-serif' : '"DejaVu Serif", Georgia, serif';
  const date = (d) => (layout === 'us' ? `${String(month + 1).padStart(2, '0')}/${String(d).padStart(2, '0')}` : layout === 'uk' ? `${String(d).padStart(2, '0')} ${MON[month]}` : `${String(d).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`);
  const head = layout === 'us' ? ['Date', 'Description', 'Withdrawals', 'Deposits', 'Balance'] : layout === 'uk' ? ['Date', 'Details', 'Paid out', 'Paid in', 'Balance'] : ['Date', 'Description', 'Debit', 'Credit', 'Balance'];
  const period = layout === 'us' ? `Statement period ${MON[month]} 1, ${year} to ${MON[month]} ${days}, ${year}` : `Statement period 1 ${MON[month]} ${year} to ${days} ${MON[month]} ${year}`;
  const td = (x, i) => `<tr${i === lose ? ' style="color:white"' : ''}><td>${date(x.day)}</td><td>${esc(x.desc)}</td><td class=n>${x.cents < 0 ? money(x.cents) : ''}</td><td class=n>${x.cents > 0 ? money(x.cents) : ''}</td><td class=n>${x.balance < 0 ? '-' : ''}${money(x.balance)}</td></tr>`;
  const html = `<!doctype html><meta charset=utf-8><style>
    body{font-family:${font};font-size:15px;color:#111;margin:48px 56px;width:820px}
    h1{font-size:20px;margin:0 0 6px} p{margin:2px 0} table{border-collapse:collapse;width:100%;margin-top:18px}
    th{text-align:left;border-bottom:1.5px solid #333;padding:5px 6px} td{padding:4px 6px} .n{text-align:right}
    th.n{text-align:right} tr.sum td{border-top:1px solid #333;font-weight:bold}</style>
    <h1>Harbor Community Bank</h1><p>Business Checking, account ending 4417</p><p>${period}</p>
    <table><tr>${head.map((h, i) => `<th${i >= 2 ? ' class=n' : ''}>${h}</th>`).join('')}</tr>
    <tr><td></td><td>${layout === 'uk' ? 'Balance brought forward' : 'Opening balance'}</td><td></td><td></td><td class=n>${money(opening)}</td></tr>
    ${rows.map(td).join('')}
    <tr><td></td><td>${layout === 'uk' ? 'Balance carried forward' : 'Closing balance'}</td><td></td><td></td><td class=n>${bal < 0 ? '-' : ''}${money(bal)}</td></tr></table>`;
  return { layout, html, rows, opening, closing: bal, lose, dayFirst: layout !== 'us' };
}

// An image-only PDF, one JPEG per page, the shape a scanner writes.
function jpegPdf(jpegs) {
  const objs = [];
  const pagesRef = 2;
  objs[1] = `<< /Type /Catalog /Pages ${pagesRef} 0 R >>`;
  const kids = [];
  let next = 3;
  const streams = [];
  for (const { bytes, w, h } of jpegs) {
    const page = next++, img = next++, content = next++;
    kids.push(`${page} 0 R`);
    const W = 612, H = Math.round((612 * h) / w);
    objs[page] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${img} 0 R >> >> /Contents ${content} 0 R >>`;
    objs[img] = { dict: `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>`, data: bytes };
    const c = Buffer.from(`q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`);
    objs[content] = { dict: `<< /Length ${c.length} >>`, data: c };
    streams.push(img, content);
  }
  objs[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
  const parts = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'binary')];
  const offsets = [];
  let pos = parts[0].length;
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = pos;
    const o = objs[i];
    const buf = typeof o === 'string' ? Buffer.from(`${i} 0 obj\n${o}\nendobj\n`) : Buffer.concat([Buffer.from(`${i} 0 obj\n${o.dict}\nstream\n`), o.data, Buffer.from('\nendstream\nendobj\n')]);
    parts.push(buf); pos += buf.length;
  }
  const xref = `xref\n0 ${objs.length}\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
  parts.push(Buffer.from(xref));
  return new Uint8Array(Buffer.concat(parts));
}

const inflate = async (b) => { try { return new Uint8Array(inflateSync(b)); } catch { return null; } };
const dir = KEEP || mkdtempSync(join(tmpdir(), 'scans-'));
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ deviceScaleFactor: 200 / 96 }); // about 200 dpi
const r = rng(SEED);
const per = [];
for (let k = 0; k < N; k++) {
  const s = makeStatement(r, k);
  const pg = await ctx.newPage();
  await pg.setContent(s.html);
  const png = join(dir, `s${k}.png`), jpg = join(dir, `s${k}.jpg`);
  await pg.screenshot({ path: png, fullPage: true });
  await pg.close();
  const skew = ((r() * 2 - 1) * 1.0).toFixed(2), q = 40 + Math.floor(r() * 46), noise = (0.15 + r() * 0.5).toFixed(2), blur = (0.3 + r() * 0.5).toFixed(2);
  const cv = spawnSync('convert', [png, '-colorspace', 'Gray', '-background', 'white', '-rotate', skew, '-seed', String(SEED * 1000 + k), '-attenuate', noise, '+noise', 'Gaussian', '-blur', `0x${blur}`, '-quality', String(q), jpg]);
  if (cv.status !== 0) throw new Error(String(cv.stderr));
  const id = spawnSync('identify', ['-format', '%w %h', jpg], { encoding: 'utf8' }).stdout.split(' ').map(Number);
  const pdf = jpegPdf([{ bytes: readFileSync(jpg), w: id[0], h: id[1] }]);
  writeFileSync(join(dir, `s${k}.pdf`), pdf);
  // the page's route: the picture out of the PDF, then OCR word boxes
  const { pages } = await pageImages(pdf, inflate);
  const lines = [];
  for (const p of pages) {
    if (p.kind !== 'jpeg') throw new Error(`page ${p.page}: ${p.kind}`);
    const img = join(dir, `s${k}-p${p.page}.jpg`);
    writeFileSync(img, p.bytes);
    const t = spawnSync('tesseract', [img, 'stdout', '--psm', '6', '-c', 'preserve_interword_spaces=1', 'tsv'], { encoding: 'utf8', env: { ...process.env, OMP_THREAD_LIMIT: '1' } });
    lines.push(...linesFromWords(wordsFromTsv(t.stdout), p.page, lines.length));
  }
  const truth = s.rows.filter((_, i) => i !== s.lose);
  const out = {};
  for (const ocr of [false, true]) {
    const res = parseStatement(lines.map((l) => ({ ...l, items: l.items.map((i) => ({ ...i })) })), { ocr, dateOrder: s.dayFirst ? 'dmy' : 'mdy' });
    const got = res.transactions;
    const key = (day, cents) => `${day}|${cents}`;
    const want = new Map();
    for (const x of truth) want.set(key(x.day, x.cents), (want.get(key(x.day, x.cents)) || 0) + 1);
    let right = 0;
    for (const t of got) { const kk = key(t.date && t.date.d, t.delta); if (want.get(kk)) { right++; want.set(kk, want.get(kk) - 1); } }
    const perfect = right === truth.length && got.length === truth.length;
    const flagged = res.reconcile.ok !== true || res.findings.some((f) => f.severity === 'error');
    const repairs = got.filter((t) => t.ocrFix).length;
    out[ocr ? 'on' : 'off'] = { rows: truth.length, read: got.length, right, perfect, flagged, repairs, ok: res.reconcile.ok };
  }
  per.push({ k, layout: s.layout, lost: s.lose >= 0, quality: q, ...out });
  if (!JSON_OUT) process.stderr.write(`s${k} ${s.layout}${s.lose >= 0 ? ' (row lost)' : ''}: off ${out.off.right}/${out.off.rows}${out.off.perfect ? ' perfect' : out.off.flagged ? ' flagged' : ' SILENT'}; on ${out.on.right}/${out.on.rows}${out.on.perfect ? ' perfect' : out.on.flagged ? ' flagged' : ' SILENT'} (${out.on.repairs} repairs)\n`);
}
await browser.close();
if (!KEEP) rmSync(dir, { recursive: true, force: true });

const sum = (m, f) => per.reduce((a, x) => a + f(x[m]), 0);
const table = {};
for (const m of ['off', 'on']) {
  const intact = per.filter((x) => !x.lost), lost = per.filter((x) => x.lost);
  table[m] = {
    rows: sum(m, (x) => x.rows), right: sum(m, (x) => x.right),
    intactPerfect: intact.filter((x) => x[m].perfect).length, intactFlagged: intact.filter((x) => !x[m].perfect && x[m].flagged).length, intactSilent: intact.filter((x) => !x[m].perfect && !x[m].flagged).length,
    lostFlagged: lost.filter((x) => x[m].flagged).length, lostSilent: lost.filter((x) => !x[m].flagged).length,
    repairs: sum(m, (x) => x.repairs),
  };
}
const intactN = per.filter((x) => !x.lost).length, lostN = per.length - intactN;
if (JSON_OUT) console.log(JSON.stringify({ n: N, seed: SEED, intact: intactN, lost: lostN, table, per }, null, 1));
else {
  console.log(`${N} statements (seed ${SEED}): ${intactN} intact, ${lostN} with one row lost from the picture`);
  console.log('| | repair off | repair on |\n|---|---|---|');
  const row = (label, f) => console.log(`| ${label} | ${f(table.off)} | ${f(table.on)} |`);
  row('rows right (day and signed amount)', (t) => `${t.right} of ${t.rows} (${((100 * t.right) / t.rows).toFixed(1)}%)`);
  row(`intact statements read perfectly (of ${intactN})`, (t) => t.intactPerfect);
  row('intact, imperfect, and the page says so', (t) => t.intactFlagged);
  row('intact, imperfect and silent', (t) => t.intactSilent);
  row(`row-lost statements the page flags (of ${lostN})`, (t) => t.lostFlagged);
  row('row-lost statements passed as proved (silent)', (t) => t.lostSilent);
  row('figures repaired', (t) => t.repairs);
}
