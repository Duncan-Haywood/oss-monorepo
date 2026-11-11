// Runs the converter on a folder of statement PDFs and prints, per file, what
// the tool itself can prove: rows found, opening/closing read, and whether
// opening + rows = closing and the running balances agree.
//   node eval/bench.mjs <dir-with-pdfs> [--json] [--verbose]
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { inflate } from '../inflate-browser.mjs';
import { parseStatementPdf, money } from '../calc.mjs';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
const verbose = args.includes('--verbose');
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.pdf$/i.test(n) ? [p] : []; });
const out = [];
for (const f of walk(dir).sort()) {
  let r;
  try { r = await parseStatementPdf(new Uint8Array(readFileSync(f)), inflate, {}); } catch (e) { out.push({ file: f, error: e.message }); continue; }
  const row = {
    file: f.split('/').pop(), rows: r.transactions.length, expected: null, opening: r.reconcile?.opening ?? null, closing: r.reconcile?.closing ?? null,
    reconciled: r.reconcile?.ok ?? null, off: r.reconcile?.diff ?? null,
    errors: r.findings.filter((x) => x.severity === 'error').map((x) => x.title),
    lines: r.summary?.lines, pages: r.flags?.pageCount, textPages: r.flags?.pagesWithText,
  };
  // A benchmark folder may carry statement-info.json with the true row count.
  const info = join(dirname(f), 'statement-info.json');
  if (existsSync(info)) row.expected = JSON.parse(readFileSync(info, 'utf8')).transactionCount ?? null;
  out.push(row);
  if (verbose) for (const t of r.transactions) console.log('   ', JSON.stringify(t).slice(0, 200));
}
if (args.includes('--json')) console.log(JSON.stringify(out, null, 1));
else for (const r of out) console.log(r.error ? `${r.file}: THREW ${r.error}` : `${r.file}: ${r.rows}${r.expected == null ? '' : '/' + r.expected} rows, pages ${r.textPages}/${r.pages}, open ${r.opening == null ? '-' : money(r.opening)}, close ${r.closing == null ? '-' : money(r.closing)}, reconciled ${r.reconciled}${r.off ? ' off ' + money(r.off) : ''}${r.errors.length ? ' | ' + r.errors.join('; ') : ''}`);
const ok = out.filter((r) => r.reconciled === true).length;
const exact = out.filter((r) => r.expected != null && r.rows === r.expected && r.reconciled === true).length;
console.log(`reconciled ${ok} of ${out.length}; right row count and reconciled ${exact} of ${out.filter((r) => r.expected != null).length} with a known count`);
