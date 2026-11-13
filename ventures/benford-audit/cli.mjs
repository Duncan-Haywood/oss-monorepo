#!/usr/bin/env node
// Command-line Benford audit of a CSV.
//   node cli.mjs ledger.csv [--amount COL] [--group COL] [--sign positive|negative|both]
//                [--min 10] [--threshold 5000,10000] [--group-min 50] [--json] [--flagged out.csv]
// COL is a header name or a 0-based column index.
import fs from 'node:fs';
import { audit, summarize, formatMoney, parseLimitList } from './benford.mjs';
import { readLedger, flaggedToCsv } from './csv.mjs';

function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (key === 'json' || key === 'help') o[key] = true;
      else o[key] = argv[++i];
    } else o._.push(a);
  }
  return o;
}

function column(header, spec) {
  if (spec === undefined) return undefined;
  if (/^\d+$/.test(spec)) return Number(spec);
  const i = header.findIndex((h) => h.toLowerCase() === String(spec).toLowerCase());
  if (i < 0) throw new Error(`No column named "${spec}". Columns: ${header.join(', ')}`);
  return i;
}

export function run(argv, out = process.stdout) {
  const args = parseArgs(argv);
  if (args.help || !args._.length) {
    out.write('Usage: node cli.mjs ledger.csv [--amount COL] [--group COL] [--sign positive|negative|both] [--min 10] [--threshold 5000,10000] [--group-min 50] [--json] [--flagged out.csv]\n');
    return args.help ? 0 : 2;
  }
  const text = fs.readFileSync(args._[0], 'utf8');
  const first = readLedger(text);
  const ledger = readLedger(text, { amountColumn: column(first.header, args.amount), groupColumn: column(first.header, args.group) });
  if (ledger.amountColumn < 0) throw new Error('Could not find an amount column; pass --amount.');
  const result = audit(ledger.records, {
    sign: args.sign || 'positive',
    minAmount: args.min !== undefined ? Number(args.min) : 10,
    thresholds: parseLimitList(args.threshold),
    groupMin: args['group-min'] !== undefined ? Number(args['group-min']) : 50,
  });
  if (args.flagged) fs.writeFileSync(args.flagged, flaggedToCsv(result.flagged));
  if (args.json) {
    out.write(JSON.stringify({ amountColumn: ledger.header[ledger.amountColumn], groupColumn: ledger.header[ledger.groupColumn] ?? null, ...result }, null, 2) + '\n');
    return 0;
  }
  const L = (s = '') => out.write(s + '\n');
  L(`Amount column: ${ledger.header[ledger.amountColumn]}${ledger.groupColumn >= 0 ? `   Group column: ${ledger.header[ledger.groupColumn]}` : ''}`);
  L(summarize(result));
  L();
  for (const note of result.applicability.notes) L(`! ${note}`);
  for (const t of [result.first, result.second, result.firstTwo]) {
    L(`${t.test.padEnd(9)} n=${t.n}  MAD=${t.mad.toFixed(4)} (${t.verdict})  chi2=${t.chiSquare.toFixed(1)} df=${t.df} p=${t.p.toExponential(2)}`);
  }
  L(`lastTwo   n=${result.lastTwo.n}  chi2=${result.lastTwo.chiSquare.toFixed(1)} df=99 p=${result.lastTwo.p?.toExponential(2)}  (${result.lastTwo.basis})`);
  for (const t of result.thresholds) L(`threshold ${formatMoney(t.threshold)}: ${t.below} just under vs ${t.above} just over (expected ${t.expectedBelow.toFixed(1)} under), p=${t.p?.toExponential(2)}${t.flagged ? '  FLAG' : ''}`);
  if (result.groups.rows.length) {
    L(`Groups (n >= ${result.groups.min}), most unusual first:`);
    for (const g of result.groups.rows.slice(0, 10)) L(`  ${g.group}: n=${g.n} excessMAD=${g.excessMad.toFixed(4)} p=${g.p.toExponential(2)} q=${g.q.toExponential(2)}${g.flagged ? '  FLAG' : ''}`);
  }
  L(`${result.flagged.length} records flagged by at least one test.`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exitCode = run(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exitCode = 1;
  }
}
