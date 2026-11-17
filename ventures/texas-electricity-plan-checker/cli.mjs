#!/usr/bin/env node
// Compare Texas electricity plans on your own usage from the command line.
//
//   node cli.mjs --usage usage.csv --plan plans.json        rank plans
//   node cli.mjs --usage usage.csv --efl label1.txt --efl label2.txt
//   node cli.mjs --example                                    the worked example
//   node cli.mjs --shape 21.0 8.1 14.1                        read a plan list's three prices
//   add --json for machine-readable output
//
// plans.json is an array of plans in the engine's shape (README, "Plan shape").
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseUsage, parseEFL, compare, shapeFromLabel, EXAMPLE } from './engine.mjs';

const USAGE = 'Usage: node cli.mjs --usage <file> (--plan <plans.json> | --efl <label.txt> ...) [--json]\n       node cli.mjs --example [--json]\n       node cli.mjs --shape <500> <1000> <2000>';

export function parseArgs(argv) {
  const a = { efl: [], plan: null, usage: null, example: false, json: false, shape: null };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--usage') a.usage = argv[++i];
    else if (x === '--plan') a.plan = argv[++i];
    else if (x === '--efl') a.efl.push(argv[++i]);
    else if (x === '--example') a.example = true;
    else if (x === '--json') a.json = true;
    else if (x === '--shape') { a.shape = argv.slice(i + 1, i + 4); i += 3; }
    else return { error: `unknown option ${x}\n${USAGE}` };
  }
  return a;
}

export function run(a, read = (f) => readFileSync(f, 'utf8')) {
  if (a.error) return { error: a.error };
  try {
    if (a.shape) return { shape: shapeFromLabel({ 500: a.shape[0], 1000: a.shape[1], 2000: a.shape[2] }) };
    let plans;
    let usageText;
    const notes = [];
    if (a.example) {
      plans = EXAMPLE.plans;
      usageText = EXAMPLE.usage;
    } else {
      if (!a.usage || (!a.plan && !a.efl.length)) return { error: USAGE };
      usageText = read(a.usage);
      plans = a.plan ? JSON.parse(read(a.plan)) : [];
      for (const f of a.efl) {
        const r = parseEFL(read(f));
        plans.push(r.plan);
        for (const n of r.notes) notes.push(`${f}: ${n}`);
      }
    }
    const usage = parseUsage(usageText);
    return { results: compare(plans, usage.months), usage, notes };
  } catch (e) {
    return { error: e instanceof SyntaxError ? `could not read the plans file as JSON: ${e.message}` : e.message };
  }
}

const money = (x) => {
  const format = (x) => `$${x.toFixed(2)}`;
  const text = format(Math.abs(x));
  return x < 0 && /[1-9]/.test(text) ? `-${text}` : text;
};

export function report(out) {
  if (out.error) return out.error;
  if (out.shape) {
    const s = out.shape;
    return [
      `Line through 500 and 2,000 kWh: ${money(s.fixedPerMonth)}/month + ${s.centsPerKwh.toFixed(2)} cents/kWh`,
      `Predicted at 1,000 kWh: ${money(s.lineAt1000)}; label: ${money(s.billAt[1])}; gap ${money(s.dip)} (${s.flag})`,
      s.flag === 'dip' ? 'Something pays out near 1,000 kWh (a bill credit or a rising energy charge): read the EFL.' : '',
      'An estimate, not financial advice.',
    ].filter(Boolean).join('\n');
  }
  const lines = [`${out.usage.months.length} months, ${Math.round(out.usage.months.reduce((s, m) => s + m.kwh, 0))} kWh`];
  for (const w of [...out.usage.warnings, ...out.notes]) lines.push(`note: ${w}`);
  for (const r of out.results) {
    if (r.error) { lines.push(`${r.plan.name}: ${r.error}`); continue; }
    const chk = r.check.status === 'match' ? 'label matches' : r.check.status === 'mismatch' ? 'LABEL MISMATCH' : r.check.status;
    lines.push(`${r.plan.name}: ${money(r.total)} (${r.cents.toFixed(2)} cents/kWh)${r.extra ? ` +${money(r.extra)}` : ' cheapest'}${r.plan.credits.length ? `, credit in ${r.creditMonths} of ${r.rows.length} months` : ''}, ${chk}`);
  }
  lines.push('Before taxes and charges the label leaves out. An estimate, not financial advice.');
  return lines.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = parseArgs(process.argv.slice(2));
  const out = run(a);
  if (out.error) {
    console.error(out.error);
    process.exit(2);
  }
  if (a.json) {
    const slim = out.shape ? out.shape : out.results.map((r) => (r.error ? { name: r.plan.name, error: r.error } : { name: r.plan.name, total: r.total, cents: r.cents, extra: r.extra, creditMonths: r.creditMonths, labelCheck: r.check.status, months: r.rows.map((m) => ({ month: m.month, kwh: m.kwh, total: m.total })) }));
    console.log(JSON.stringify(slim, null, 2));
  } else console.log(report(out));
}
