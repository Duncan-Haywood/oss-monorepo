// Built-in keyword layer against Hack Club's archived books (hackclub/ledger,
// main.ledger, 2015-2018, Open Data Commons licence): a real US nonprofit's own
// payee and account for each transaction. Fetched at run time, never copied.
//
//   node eval/hackclub-ledger.mjs [main.ledger] [--split test|train|all] [--misses 40]
//
// A ledger transaction has a payee (`2015/01/24 Lyft`) and postings; we score the
// payee text alone against the account the treasurer chose. Descriptors are
// clean merchant names, easier than raw bank text: read this as an upper bound.
// Split: a line is "test" when a hash of its payee lands in the top fifth.
import { readFileSync } from "node:fs";
import { suggest } from "../categorize.mjs";

export const MAP = {
  "Expenses:Operating:Food": ["6130"], "Expenses:Fundraising:Food": ["6130"],
  "Expenses:Operating:Transportation:Ground": ["6120", "6160"], "Expenses:Fundraising:Transportation:Ground": ["6120", "6160"],
  "Expenses:Marketing:Transportation:Ground": ["6120", "6160"],
  "Expenses:Operating:Transportation:Air": ["6120"], "Expenses:Fundraising:Transportation:Air": ["6120"],
  "Expenses:Operating:Accommodation": ["6120"], "Expenses:Fundraising:Accommodation": ["6120"],
  "Expenses:Operating:Software": ["6060"], "Expenses:Operating:Hosting": ["6060"], "Expenses:Fundraising:Software": ["6060"],
  "Expenses:Operating:Office:Supplies": ["6070", "6100"], "Expenses:Operating:Shipping": ["6180", "6070"],
  "Expenses:Operating:Bank": ["6010"], "Expenses:Operating:Contracting": ["6020"], "Expenses:Marketing:Contracting": ["6020"],
  "Expenses:Operating:Office:Rent": ["6080"], "Expenses:Operating:Legal": ["6050"], "Expenses:Operating:Tax": ["6110"],
  "Expenses:Operating:Insurance": ["6030"], "Expenses:Operating:Staff:Salary": ["6150"],
  "Expenses:Marketing:Ads": ["6000"], "Expenses:Marketing:Stickers": ["6000"], "Expenses:Marketing:T-Shirts": ["6000"],
  "Expenses:Marketing:Other": ["6000"],
};
export const INCOME = {
  "Income:Bank Interest": ["4200"], "Income:Website Donations": ["4000", "4100"], "Income:Fundraising": ["4000", "4100"],
  "Income:Other": ["4000", "4100"], "Income:Hack Camp": ["4000"],
};

export function parseLedger(text) {
  const rows = [];
  let payee = null, acct = null, date = null;
  const flush = () => { if (payee && acct) rows.push({ desc: payee, cat: acct, date }); payee = acct = null; };
  for (const line of text.split(/\r?\n/)) {
    const h = line.match(/^(\d{4}\/\d\d\/\d\d)\s+(?:[*!]\s+)?(?:\([^)]*\)\s+)?(.+?)\s*$/);
    if (h) { flush(); date = h[1]; payee = h[2]; continue; }
    const p = line.match(/^\s+((?:Expenses|Income):[^\s$].*?)(?:\s{2,}|\t|$)/);
    if (p && !acct) acct = p[1].trim();
    if (!line.trim()) flush();
  }
  flush();
  return rows;
}
export const isTest = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h % 5 === 4; };

export function score(rows) {
  const out = { n: rows.length, scored: 0, unscored: 0, right: 0, wrong: 0, blank: 0, byCat: {}, misses: [] };
  for (const r of rows) {
    const want = MAP[r.cat] ?? INCOME[r.cat];
    if (!want) { out.unscored++; continue; }
    const cents = r.cat.startsWith("Income") ? 10000 : -10000;
    const s = suggest({ desc: r.desc, cents }, { rules: [], codes: null, classifier: { n: 0 }, skip: new Set(["learned"]) });
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
  const file = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "/tmp/hc/main.ledger";
  const split = arg("--split", "all");
  const rows = parseLedger(readFileSync(file, "utf8")).filter((r) => split === "all" || (split === "test") === isTest(r.desc));
  const o = score(rows);
  const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + "%" : "-");
  console.log(`${split}: ${o.n} transactions, ${o.scored} in accounts that name a chart account, ${o.unscored} unscored`);
  console.log(`  suggested ${pct(o.right + o.wrong, o.scored)}  right of suggested ${pct(o.right, o.right + o.wrong)}  right of all ${pct(o.right, o.scored)}  wrong ${o.wrong}  blank ${o.blank}`);
  for (const [k, v] of Object.entries(o.byCat)) console.log(`  ${k.padEnd(44)} n=${v.n} right ${pct(v.right, v.n)} wrong ${pct(v.wrong, v.n)} blank ${pct(v.blank, v.n)}`);
  const seen = new Map();
  for (const x of o.misses) { const k = `${x.cat}|${x.got}|${x.desc}`; seen.set(k, (seen.get(k) ?? 0) + 1); }
  [...seen].sort((a, b) => b[1] - a[1]).slice(0, +arg("--misses", 0)).forEach(([k, n]) => { const [c, g, d] = k.split("|"); console.log(`  x${n} [${c}] got ${g} ${d}`); });
}
