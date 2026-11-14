// Capital One card export: the bank reader and the built-in keyword layer on one
// real person's file, labelled by Capital One's own Category column.
// pythoninoffice/tutorials sample_data/cc_statement.csv (533 rows, Canadian
// card, Dec 2022 to 2023; no licence file, so fetched at run time, never copied).
//
//   node eval/capone-card.mjs [file.csv] [--misses 40]
//   fetch: curl -O https://raw.githubusercontent.com/pythoninoffice/tutorials/master/sample_data/cc_statement.csv
//
// Capital One's categories are personal ("Merchandise", "Internet" is Amazon
// Marketplace), so only the ones that point at one business account are scored.
import { readFileSync } from "node:fs";
import { readStatement } from "../bank.mjs";
import { suggest } from "../categorize.mjs";
import { pathToFileURL } from "node:url";

export const MAP = {
  Dining: ["6130"], "Gas/Automotive": ["6160"], "Phone/Cable": ["6140", "6060"],
  "Fee/Interest Charge": ["6010", "6040"], Insurance: ["6030"], "Other Travel": ["6120", "6160"],
  "Professional Services": ["6050"], Entertainment: ["6060", "6120", "6130"],
};

// Capital One's category per row, in file order (the reader drops it).
export function labels(text) {
  const out = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.length > 1) out.push(row); row = []; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); out.push(row); }
  return out.slice(1).map((r) => r[4]);
}

export function score(text) {
  const st = readStatement(text);
  const cats = labels(text);
  const o = { bank: st.bank, rows: st.rows.length, labelled: cats.length, n: 0, scored: 0, right: 0, wrong: 0, blank: 0, unscored: 0, unscoredHit: 0, payments: 0, byCat: {}, misses: [] };
  st.rows.forEach((r, i) => {
    const cat = cats[i];
    if (cat === "Payment/Credit") { if (r.cents > 0) o.payments++; return; }
    if (r.cents >= 0) return;
    o.n++;
    const s = suggest({ desc: r.desc, cents: r.cents }, { rules: [], codes: null, classifier: { n: 0 }, skip: new Set(["learned"]) });
    const want = MAP[cat];
    if (!want) { o.unscored++; if (s.account) o.unscoredHit++; return; }
    o.scored++;
    const c = (o.byCat[cat] ??= { n: 0, right: 0, wrong: 0, blank: 0 });
    c.n++;
    if (!s.account) { o.blank++; c.blank++; o.misses.push({ cat, got: null, desc: r.desc }); }
    else if (want.includes(s.account)) { o.right++; c.right++; }
    else { o.wrong++; c.wrong++; o.misses.push({ cat, got: s.account, desc: r.desc }); }
  });
  return o;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i === -1 ? d : process.argv[i + 1]; };
  const file = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "cc_statement.csv";
  const o = score(readFileSync(file, "utf8"));
  const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + "%" : "-");
  console.log(`reader: bank=${o.bank}, ${o.rows} rows of ${o.labelled} lines, ${o.payments} payments in`);
  console.log(`${o.n} purchases, ${o.scored} in labels that name an account, ${o.unscored} unscored (${o.unscoredHit} given an account anyway)`);
  console.log(`  suggested ${pct(o.right + o.wrong, o.scored)}  right of suggested ${pct(o.right, o.right + o.wrong)}  right of all ${pct(o.right, o.scored)}  wrong ${o.wrong}  blank ${o.blank}`);
  for (const [k, v] of Object.entries(o.byCat)) console.log(`  ${k.padEnd(22)} n=${v.n} right ${pct(v.right, v.n)} wrong ${pct(v.wrong, v.n)} blank ${pct(v.blank, v.n)}`);
  for (const x of o.misses.slice(0, +arg("--misses", 0))) console.log(`  [${x.cat}] ${x.got ?? "-"}  ${x.desc}`);
}
