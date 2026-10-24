// Built-in keyword layer against DoDataThings/us-bank-transaction-categories
// (MIT, 16,000 synthetic US bank descriptions in 16 personal-finance
// categories, no amounts). Someone else's descriptions, labelled by someone else.
//
//   node eval/hf-bank-categories.mjs [file.csv] [--split test|train|all] [--misses 40]
//
// The dataset is personal finance, this engine is small-business books, so the
// taxonomies only partly overlap. MAP lists the categories that name one account
// in the default chart; the rest (groceries, shopping, healthcare...) have no
// business account, and a keyword hit there is not counted wrong or right.
// Split: a line is "test" when a hash of its text lands in the top fifth. Rules
// are tuned looking only at the other four fifths.
import { readFileSync } from "node:fs";
import { suggest } from "../categorize.mjs";

export const MAP = {
  Restaurants: ["6130"], Travel: ["6120"], Transportation: ["6160", "6120"], Subscription: ["6060"],
  Utilities: ["6140"], Insurance: ["6030"], Education: ["6170"], Fees: ["6010"], Transfer: ["transfer"],
};
export const INCOME = { Income: ["4000", "4200"] };

export function parseCsv(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/).slice(1)) {
    const m = line.match(/^"((?:[^"]|"")*)","([^"]*)"$/);
    if (m) rows.push({ desc: m[1].replace(/""/g, '"'), cat: m[2] });
  }
  return rows;
}
export const isTest = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h % 5 === 4; };

export function score(rows) {
  const out = { n: 0, scored: 0, hit: 0, right: 0, wrong: 0, blank: 0, offChart: 0, offChartHit: 0, byCat: {}, misses: [] };
  for (const r of rows) {
    out.n++;
    const want = MAP[r.cat] ?? INCOME[r.cat];
    const cents = r.cat === "Income" ? 10000 : -10000;
    const s = suggest({ desc: r.desc, cents }, { rules: [], codes: null, classifier: { n: 0 } , skip: new Set(["learned"]) });
    if (!want) { out.offChart++; if (s.account) out.offChartHit++; continue; }
    out.scored++;
    const c = (out.byCat[r.cat] ??= { n: 0, right: 0, wrong: 0, blank: 0 });
    c.n++;
    if (!s.account) { out.blank++; c.blank++; out.misses.push({ ...r, got: null }); }
    else if (want.includes(s.account)) { out.right++; c.right++; }
    else { out.wrong++; c.wrong++; out.misses.push({ ...r, got: s.account }); }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i === -1 ? d : process.argv[i + 1]; };
  const file = process.argv[2]?.endsWith(".csv") ? process.argv[2] : "/tmp/ds/t.csv";
  const split = arg("--split", "test");
  const rows = parseCsv(readFileSync(file, "utf8")).filter((r) => split === "all" || (split === "test") === isTest(r.desc));
  const o = score(rows);
  const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + "%" : "-");
  console.log(`${split}: ${o.n} lines, ${o.scored} in categories that name one account, ${o.offChart} off-chart`);
  console.log(`  suggested ${pct(o.right + o.wrong, o.scored)}  right of suggested ${pct(o.right, o.right + o.wrong)}  right of all ${pct(o.right, o.scored)}  wrong ${o.wrong}  blank ${o.blank}`);
  console.log(`  off-chart lines given an account: ${pct(o.offChartHit, o.offChart)}`);
  for (const [k, v] of Object.entries(o.byCat)) console.log(`  ${k.padEnd(15)} n=${v.n} right ${pct(v.right, v.n)} wrong ${pct(v.wrong, v.n)} blank ${pct(v.blank, v.n)}`);
  const m = +arg("--misses", 0);
  for (const x of o.misses.slice(0, m)) console.log(`  [${x.cat}] ${x.got ?? "-"}  ${x.desc}`);
}
