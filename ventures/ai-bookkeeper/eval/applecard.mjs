// Built-in keyword layer against two real Apple Card exports (Apple's own Category and Merchant columns):
//   calebkey121/sandbox pet_projects/resolve_credit_fraud/statements/Apple Card Transactions - April 2025.csv
//   rolandrao/BudgetApp statements/jan_24.csv
// Neither repository has a licence file, so both are fetched at run time and never copied; the
// exports carry cardholder names, which this script never prints. Only labels that name one
// business account are scored (Apple's "Other", "Shopping", "Entertainment" name none); a
// suggestion on the rest is counted apart and not marked wrong.
//
//   node eval/applecard.mjs a.csv b.csv [--misses 40]
import { readFileSync } from "node:fs";
import { suggest } from "../categorize.mjs";
import { pathToFileURL } from "node:url";

export const MAP = {
  Restaurants: ["6130"], Grocery: ["6130"], Gas: ["6160"], Transportation: ["6120"], Airlines: ["6120"],
  Utilities: ["6140", "6060"], Insurance: ["6030"], "Govt-services-parking": ["6160"], Hotels: ["6120"],
};
export function parseLines(t) {
  return t.trim().split(/\r?\n/).map((l) => { const o = []; let c = "", q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === "," && !q) { o.push(c); c = ""; } else c += ch; } o.push(c); return o; });
}
export function score(files) {
  const model = { rules: [], codes: null, classifier: { n: 0 }, skip: new Set(["learned"]) };
  const o = { n: 0, scored: 0, right: 0, wrong: 0, blank: 0, unscored: 0, misses: [] };
  for (const f of files) for (const c of parseLines(readFileSync(f, "utf8")).slice(1)) {
    if (c[5] !== "Purchase") continue;
    o.n++;
    const want = MAP[c[4]];
    const a = suggest({ desc: c[2], cents: -Math.round(parseFloat(c[6]) * 100) }, model).account;
    if (!want) { o.unscored++; continue; }
    o.scored++;
    if (!a) { o.blank++; o.misses.push([c[4], "-", c[2]]); } else if (want.includes(a)) o.right++; else { o.wrong++; o.misses.push([c[4], a, c[2]]); }
  }
  return o;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf("--misses");
  const files = process.argv.slice(2).filter((x, j) => !x.startsWith("--") && process.argv[j + 1] !== "--misses" || false).filter((x) => x.endsWith(".csv"));
  const o = score(files), p = (a, b) => (b ? (100 * a / b).toFixed(1) + "%" : "-");
  console.log(`${o.n} purchases, ${o.scored} in labels that name an account, ${o.unscored} unscored`);
  console.log(`  suggested ${p(o.right + o.wrong, o.scored)}  right of suggested ${p(o.right, o.right + o.wrong)}  right of all ${p(o.right, o.scored)}  wrong ${o.wrong}  blank ${o.blank}`);
  if (i > -1) for (const m of o.misses.slice(0, +process.argv[i + 1])) console.log(`  [${m[0]}] ${m[1]}  ${m[2].replace(/\s+\d{5}\b.*$/, "").slice(0, 50)}`);
}
