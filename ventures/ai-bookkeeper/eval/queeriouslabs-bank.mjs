// Built-in keyword layer against a real small organisation's bank exports:
// queeriouslabs/bank-account-activity (a San Francisco makerspace's own
// 2019-2023 statements with its own Category per line, no licence file, so the
// files are fetched at run time and never copied here).
//
//   node eval/queeriouslabs-bank.mjs [dir-with-2019.csv...2023.csv] [--misses 60]
//   fetch: curl -O https://raw.githubusercontent.com/queeriouslabs/bank-account-activity/master/<year>.csv
//
// Real bank-statement descriptors ("DEBIT CARD #XXXX 01/01 MONKEYBRAINS ..."),
// labelled by the people who kept the books. Scores the Statement Description
// column, which is what a bank export gives us.
import { readFileSync } from "node:fs";
import { suggest } from "../categorize.mjs";

// Their label -> accounts in the default chart that would be an acceptable answer.
export const MAP = {
  Rent: ["6080"], "Mortgage &amp; Rent": ["6080"], Utilities: ["6140"], Internet: ["6140"],
  "Web Infrastructure": ["6060"], Insurance: ["6030"], "ATM Fee": ["6010"], "ATM Fee?": ["6010"],
  "Filing Fee": ["6110", "6050"], "IRS Fee": ["6110"], Compliance: ["6050", "6110"], "Corporate Compliance": ["6050", "6110"],
  Transfer: ["transfer"],
};
export const INCOME = { Income: ["4000", "4100", "4200"] };

export function parseRows(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.length > 1) rows.push(row); row = []; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.slice(1).map((r) => ({ desc: r[2], cat: r[3], debit: r[4], credit: r[5] })).filter((r) => r.desc);
}

export function score(rows) {
  const out = { n: 0, scored: 0, right: 0, wrong: 0, blank: 0, unscored: 0, byCat: {}, misses: [] };
  for (const r of rows) {
    out.n++;
    const want = MAP[r.cat] ?? INCOME[r.cat];
    if (!want) { out.unscored++; continue; }
    const cents = r.cat === "Income" ? 10000 : -10000;
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
  const dir = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "/tmp/qd";
  const rows = [];
  for (const y of [2019, 2020, 2021, 2022, 2023]) { try { rows.push(...parseRows(readFileSync(`${dir}/${y}.csv`, "utf8"))); } catch {} }
  const o = score(rows);
  const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + "%" : "-");
  console.log(`${o.n} lines, ${o.scored} in labels that name an account, ${o.unscored} unscored`);
  console.log(`  suggested ${pct(o.right + o.wrong, o.scored)}  right of suggested ${pct(o.right, o.right + o.wrong)}  right of all ${pct(o.right, o.scored)}  wrong ${o.wrong}  blank ${o.blank}`);
  for (const [k, v] of Object.entries(o.byCat)) console.log(`  ${k.padEnd(22)} n=${v.n} right ${pct(v.right, v.n)} wrong ${pct(v.wrong, v.n)} blank ${pct(v.blank, v.n)}`);
  for (const x of o.misses.slice(0, +arg("--misses", 0))) console.log(`  [${x.cat}] ${x.got ?? "-"}  ${x.desc}`);
}
