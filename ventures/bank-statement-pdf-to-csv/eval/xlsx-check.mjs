// Checks the Excel workbook's formulas against the numbers this tool computed.
//
// For each statement, the workbook is written twice: as shipped, and with no
// cached formula values. LibreOffice opens the second, has to calculate every
// formula itself, and exports each sheet to CSV; every cell is then compared
// with what workbookSheets() wrote (values computed here in integer cents).
// A formula that points at the wrong column, flips a card's sign or skips a
// row shows up as a mismatch.
//
//   node eval/xlsx-check.mjs <out-dir> [<folder of statement PDFs> ...]
//
// Needs `soffice` (LibreOffice 7.2 or newer, for one CSV per sheet).
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { inflate } from '../inflate-browser.mjs';
import { parseStatementPdf, parseStatementText, sampleStatement, sampleCard, sampleBroken } from '../calc.mjs';
import { stitch } from '../bankfile.mjs';
import { toXlsx, workbookSheets } from '../xlsx.mjs';

const [out, ...dirs] = process.argv.slice(2);
if (!out) { console.error('usage: node eval/xlsx-check.mjs <out-dir> [pdf-folder ...]'); process.exit(2); }
mkdirSync(out, { recursive: true });

// Two made-up months of one account, the second opening where the first
// closes, joined; and the same with the first month missing a row.
const month = (m, open, rows) => {
  let bal = open;
  const body = rows.map(([d, desc, c]) => { bal += c; return `${String(m).padStart(2, '0')}/${d}     ${desc.padEnd(40)} ${c < 0 ? (-c / 100).toFixed(2).padStart(10) : ''.padStart(10)} ${c > 0 ? (c / 100).toFixed(2).padStart(10) : ''.padStart(10)} ${(bal / 100).toFixed(2).padStart(12)}`; });
  return { closing: bal, text: [`EXAMPLE BANK  Statement period: ${m}/1/2026 - ${m}/28/2026`, `Beginning balance ${(open / 100).toFixed(2)}`, `Ending balance ${(bal / 100).toFixed(2)}`, '', 'Date      Description                                Withdrawals   Deposits      Balance', ...body].join('\n') };
};
const jan = month(1, 250000, [['03', 'ACH CREDIT CLIENT A', 120000], ['09', 'CARD PURCHASE PRINT SHOP', -4312], ['20', 'RENT', -95000]]);
const feb = month(2, jan.closing, [['02', 'ACH CREDIT CLIENT B', 88050], ['14', 'ACH DEBIT INSURANCE', -21017]]);

const cases = [
  ['sample-bank', parseStatementText(sampleStatement(), { kind: 'bank' })],
  ['sample-card', parseStatementText(sampleCard(), { kind: 'card' })],
  ['sample-lost-row', parseStatementText(sampleBroken(), { kind: 'bank' })],
  ['joined-two-months', stitch([{ name: 'feb.pdf', result: parseStatementText(feb.text) }, { name: 'jan.pdf', result: parseStatementText(jan.text) }])],
];
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.pdf$/i.test(n) ? [p] : []; });
for (const d of dirs) for (const f of walk(d).sort()) {
  try { cases.push([basename(f, '.pdf'), await parseStatementPdf(new Uint8Array(readFileSync(f)), inflate, {})]); } catch (e) { console.log(`${f}: not read (${e.message})`); }
}

// What a spreadsheet should show in each cell, as LibreOffice's CSV writes it.
const pad = (n) => String(n).padStart(2, '0');
const fromSerial = (s) => { const t = new Date((s - 25569) * 86400000); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };
function want(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && 'f' in v) return v.v === null || v.v === undefined ? '' : typeof v.v === 'string' ? v.v : v.money ? v.v / 100 : v.v;
  if (typeof v === 'object' && 'date' in v) return fromSerial(v.date);
  if (typeof v === 'object' && 'money' in v) return v.money / 100;
  return String(v);
}
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

let totalCells = 0, totalFormulas = 0, bad = 0;
const lines = [];
for (const [name, result] of cases) {
  if (!result.transactions.length) { lines.push(`${name}: no rows, skipped`); continue; }
  const sheets = workbookSheets(result);
  const file = join(out, `${name}.xlsx`);
  writeFileSync(file, await toXlsx(result, { cache: false }));
  writeFileSync(join(out, `${name}-shipped.xlsx`), await toXlsx(result));
  const csvDir = join(out, `${name}-csv`);
  if (existsSync(csvDir)) rmSync(csvDir, { recursive: true });
  execFileSync('soffice', ['--headless', '--convert-to', 'csv:Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,false,false,false,-1', '--outdir', csvDir, file], { stdio: 'ignore', timeout: 120000, env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } });
  let cells = 0, formulas = 0, miss = 0;
  const firstMiss = [];
  for (const sh of sheets) {
    const path = join(csvDir, `${name}-${sh.name}.csv`);
    if (!existsSync(path)) { miss++; firstMiss.push(`${sh.name}: sheet not exported`); continue; }
    const got = parseCsv(readFileSync(path, 'utf8'));
    sh.rows.forEach((r, ri) => r.forEach((v, ci) => {
      const w = want(v);
      const g = (got[ri] || [])[ci] ?? '';
      cells++;
      if (v && typeof v === 'object' && 'f' in v) formulas++;
      const same = typeof w === 'number' ? g !== '' && Math.abs(Number(g) - w) < 1e-9 : g === w;
      if (!same) { miss++; if (firstMiss.length < 3) firstMiss.push(`${sh.name}!R${ri + 1}C${ci + 1}: want ${JSON.stringify(w)} got ${JSON.stringify(g)}`); }
    }));
  }
  totalCells += cells; totalFormulas += formulas; bad += miss;
  const s = sheets[0].rows.find((r) => r[0] && r[1] && sheets.some((x) => x.name === r[1]));
  const verdict = s ? want(s[9]) : '?';
  lines.push(`${name}: ${result.transactions.length} rows, ${sheets.length} sheets, ${cells} cells (${formulas} formulas), ${miss} differ from LibreOffice's recalculation; workbook says adds up: ${verdict}${firstMiss.length ? ' | ' + firstMiss.join('; ') : ''}`);
}
lines.push(`total: ${cases.length} workbooks, ${totalCells} cells, ${totalFormulas} formulas recalculated by LibreOffice, ${bad} differ`);
console.log(lines.join('\n'));
process.exit(bad ? 1 : 0);
