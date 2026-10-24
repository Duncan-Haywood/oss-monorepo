// Built-in keyword layer against Beancount's examples/example.beancount (GPL-2.0,
// read at run time from a path you give, never copied into this repo): ~2,200
// generated transactions with made-up payees and a small set of narrations.
//
//   node eval/beancount-example.mjs path/to/example.beancount [--misses 30]
//
// A transaction is scored when its expense leg is one of MAP. The line is
// "payee narration", the text a bank statement would carry in the memo.
import { readFileSync } from "node:fs";
import { suggest } from "../categorize.mjs";

export const MAP = {
  "Expenses:Home:Rent": ["6080"], "Expenses:Home:Electricity": ["6140"], "Expenses:Home:Phone": ["6140"],
  "Expenses:Home:Internet": ["6140"], "Expenses:Financial:Fees": ["6010"], "Expenses:Food:Restaurant": ["6130"],
  "Expenses:Food:Coffee": ["6130"], "Expenses:Transport:Tram": ["6160", "6120"],
  "Expenses:Health:Medical:Insurance": ["6030"], "Expenses:Health:Dental:Insurance": ["6030"],
  "Expenses:Health:Vision:Insurance": ["6030"],
};

export function parse(text) {
  const rows = [];
  for (const block of text.split(/\n(?=\d{4}-\d\d-\d\d )/)) {
    const m = block.match(/^\d{4}-\d\d-\d\d [*!] "([^"]*)"(?: "([^"]*)")?/);
    if (!m) continue;
    const exp = [...block.matchAll(/^\s+(Expenses:[A-Za-z:-]+)\s+(-?[\d.]+) USD/gm)];
    if (exp.length !== 1) continue;
    rows.push({ desc: [m[1], m[2]].filter(Boolean).join(" ").trim(), acct: exp[0][1], cents: -Math.round(Math.abs(+exp[0][2]) * 100) });
  }
  return rows;
}

export function score(rows) {
  const o = { scored: 0, right: 0, wrong: 0, blank: 0, offChart: 0, offChartHit: 0, misses: [], byAcct: {} };
  for (const r of rows) {
    const want = MAP[r.acct];
    const s = suggest({ desc: r.desc, cents: r.cents }, { rules: [], codes: null, classifier: { n: 0 }, skip: new Set(["learned"]) });
    if (!want) { o.offChart++; if (s.account) o.offChartHit++; continue; }
    o.scored++;
    const c = (o.byAcct[r.acct] ??= { n: 0, right: 0, wrong: 0, blank: 0 });
    c.n++;
    if (!s.account) { o.blank++; c.blank++; o.misses.push({ ...r, got: null }); }
    else if (want.includes(s.account)) { o.right++; c.right++; }
    else { o.wrong++; c.wrong++; o.misses.push({ ...r, got: s.account }); }
  }
  return o;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i === -1 ? d : process.argv[i + 1]; };
  const rows = parse(readFileSync(process.argv[2], "utf8"));
  const o = score(rows);
  const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + "%" : "-");
  console.log(`${rows.length} single-expense transactions, ${o.scored} scored, ${o.offChart} off-chart`);
  console.log(`suggested ${pct(o.right + o.wrong, o.scored)}  right of suggested ${pct(o.right, o.right + o.wrong)}  wrong ${o.wrong}  blank ${o.blank}`);
  console.log(`off-chart lines given an account: ${pct(o.offChartHit, o.offChart)}`);
  for (const [k, v] of Object.entries(o.byAcct)) console.log(`  ${k.padEnd(36)} n=${v.n} right ${pct(v.right, v.n)} wrong ${v.wrong} blank ${v.blank}`);
  const seen = new Set();
  for (const x of o.misses) { const key = x.desc + x.got; if (seen.has(key) || seen.size >= +arg("--misses", 0)) continue; seen.add(key); console.log(`  [${x.acct}] ${x.got ?? "-"}  ${x.desc}`); }
}
