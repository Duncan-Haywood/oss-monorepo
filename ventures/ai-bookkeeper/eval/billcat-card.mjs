// Built-in keyword layer against one real person's Chase credit-card export:
// blakeb211/billcat-local-llm data/cc_transactions.csv (472 lines, Dec 2023
// onward, Chase's own Category column, no licence file, so fetched at run time
// and never copied).
//
//   node eval/billcat-card.mjs [file.csv] [--misses 60]
//   fetch: curl -O https://raw.githubusercontent.com/blakeb211/billcat-local-llm/HEAD/data/cc_transactions.csv
//
// Real card-feed descriptors, labelled by Chase's own merchant database, not by
// a bookkeeper. Chase's categories are personal ("Shopping", "Personal" name no
// business account), so only the ones that point at one account are scored; a
// suggestion on the rest is counted separately and not marked wrong.
import { readFileSync } from "node:fs";
import { suggest } from "../categorize.mjs";

export const MAP = {
  "Food & Drink": ["6130"], Gas: ["6160"], Travel: ["6120", "6160"], "Bills & Utilities": ["6140", "6060"],
  "Fees & Adjustments": ["6010", "6040"], Automotive: ["6160", "6090"], Education: ["6170"],
};

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
  return rows.slice(1).map((r) => ({ desc: r[2], cat: r[3], type: r[4], amount: parseFloat(r[5]) })).filter((r) => r.desc && r.type === "Sale");
}

export function score(rows) {
  const out = { n: 0, scored: 0, right: 0, wrong: 0, blank: 0, unscored: 0, unscoredHit: 0, byCat: {}, misses: [] };
  for (const r of rows) {
    out.n++;
    const s = suggest({ desc: r.desc, cents: Math.round(r.amount * 100) }, { rules: [], codes: null, classifier: { n: 0 }, skip: new Set(["learned"]) });
    const want = MAP[r.cat];
    if (!want) { out.unscored++; if (s.account) out.unscoredHit++; continue; }
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
  const file = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "/tmp/billcat/cc_transactions.csv";
  const o = score(parseRows(readFileSync(file, "utf8")));
  const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + "%" : "-");
  console.log(`${o.n} sales, ${o.scored} in labels that name an account, ${o.unscored} unscored (${o.unscoredHit} given an account anyway)`);
  console.log(`  suggested ${pct(o.right + o.wrong, o.scored)}  right of suggested ${pct(o.right, o.right + o.wrong)}  right of all ${pct(o.right, o.scored)}  wrong ${o.wrong}  blank ${o.blank}`);
  for (const [k, v] of Object.entries(o.byCat)) console.log(`  ${k.padEnd(20)} n=${v.n} right ${pct(v.right, v.n)} wrong ${pct(v.wrong, v.n)} blank ${pct(v.blank, v.n)}`);
  for (const x of o.misses.slice(0, +arg("--misses", 0))) console.log(`  [${x.cat}] ${x.got ?? "-"}  ${x.desc}`);
}
