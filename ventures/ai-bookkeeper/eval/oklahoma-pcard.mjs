// Oklahoma's purchasing-card reports, read the way the CLI reads them, and the
// merchant-category and name layers measured on US card lines.
//
// The State of Oklahoma (Office of Management and Enterprise Services) publishes
// every state purchasing-card line, a month per file, with the merchant as the bank
// printed it and the card network's merchant category NAME, cut to 40 characters
// ("STATIONERY,OFFICE SUPPLIES,PRINTING AND"). Its counties' combined P-Card report
// (2022 to 2024) has the same columns under thirty-odd spellings of the header,
// written month by month by hand: "MCC_DESCRPTION", " Amount ", "$425.60 ",
// "MERCHANT_NAME", "Purchase Date", one month with old Mac line ends (CR only), two
// months saved as Excel 97 workbooks. Both are the State of Oklahoma's open data
// (data.ok.gov, Open Database License per the portal); nothing is copied here.
// Cardholder names are in the files and are never read or printed by this script.
//
//   for slug in purchase-card-pcard-fiscal-year-2017 purchase-card-pcard-fiscal-year-2018 county-pcard-purchase-card; do
//     mkdir -p $slug && curl -s "https://data.ok.gov/api/3/action/package_show?id=$slug" \
//       | python3 -c 'import json,sys; [print(r["url"]) for r in json.load(sys.stdin)["result"]["resources"]]' \
//       | (cd $slug && while read u; do curl -sLO "$u"; done)
//   done
//   node eval/oklahoma-pcard.mjs read --dir <folder> [--dir <folder> ...]
//   node eval/oklahoma-pcard.mjs names --dir <folder> [--top 40] [--skip brand|keywords]
//
// `read` imports each file through readStatementFile + readStatement and checks it
// against a separate, deliberately plain reading of the same file (the Amount column
// by its header, "$1,234.50 " and "(12.00)" by hand): every line read, every charge
// money out, the category on every line, totals to the penny.
//
// `names` has no bookkeeper's labels to score against: the files say which kind of
// merchant took the money, not which account the state filed it to. It measures two
// things the labelled sets could not. (1) How often the category name alone gives an
// account (`mccFromName`), on real, truncated US network names. (2) The name-only
// layers (the built-in keywords and the chain list) read from empty books on US card
// lines, scored for agreement with the account the category name gives where both
// speak. Agreement is not correctness: an office-supply store's category on a line
// the keywords file as software is a disagreement either could be wrong about.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseCsv, readStatement } from "../bank.mjs";
import { readStatementFile } from "../ocr.mjs";
import { mccFromName, normaliseMccName } from "../mcc.mjs";
import { suggest } from "../categorize.mjs";

const isData = (f) => /\.(csv|txt|xls|xlsx)$/i.test(f) && f !== "urls.txt"; // urls.txt: the fetch list above

export function filesIn(dirs) {
  const out = [];
  for (const d of dirs) for (const f of readdirSync(d).sort()) if (isData(f) && statSync(join(d, f)).isFile()) out.push(join(d, f));
  return out;
}

// The plain reading: header row, the amount and category columns by name, a line
// counted when it has a date-like cell and an amount.
const plainCents = (v) => {
  let s = String(v ?? "").trim().replace(/[$,\s]/g, "");
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [w, f = ""] = s.split(".");
  const c = Number(w) * 100 + Number((f + "00").slice(0, 2));
  return neg ? -c : c;
};
export function plainRead(text) {
  const rows = parseCsv(text);
  const h = (rows[0] ?? []).map((x) => x.trim().toLowerCase());
  const amt = h.findIndex((x) => x === "amount");
  const cat = h.findIndex((x) => /^mcc[ _]?descr?i?ption$/.test(x));
  let n = 0, cents = 0, withCat = 0;
  for (const r of rows.slice(1)) {
    const c = plainCents(r[amt]);
    if (c === null) continue;
    n++; cents += c;
    if (cat !== -1 && String(r[cat] ?? "").trim()) withCat++;
  }
  return { n, cents, withCat };
}

export function readCheck(files) {
  const tot = { files: 0, lines: 0, ok: 0, bad: [] };
  for (const f of files) {
    const { text } = readStatementFile(f);
    const plain = plainRead(text);
    const got = readStatement(text);
    const rows = got.rows;
    const out = rows.reduce((a, r) => a - r.cents, 0);
    const charges = rows.filter((r) => r.cents < 0).length;
    const withMcc = rows.filter((r) => r.mcc).length;
    const fine = rows.length === plain.n && out === plain.cents && withMcc === plain.withCat && charges >= rows.length * 0.8;
    tot.files++; tot.lines += rows.length;
    if (fine) tot.ok++;
    else tot.bad.push({ file: f.split("/").pop(), read: rows.length, plain: plain.n, out: out / 100, plainTotal: plain.cents / 100, charges, withMcc, plainCat: plain.withCat, problems: got.problems.length });
  }
  return tot;
}

// Name-only layers from empty books: no memory, no category column.
export function namesCheck(files, { skip = [], top = 40 } = {}) {
  const byName = new Map();
  const s = { lines: 0, named: 0, kw: 0, kwAgree: 0, kwDisagree: 0, kwNoCat: 0 };
  const disagree = new Map();
  for (const f of files) {
    const { text } = readStatementFile(f);
    for (const r of readStatement(text).rows) {
      if (r.cents >= 0) continue;
      s.lines++;
      const cat = r.mcc ? mccFromName(r.mcc) : null;
      const key = normaliseMccName(r.mcc ?? "");
      const e = byName.get(key) ?? { raw: r.mcc ?? "", n: 0, account: cat?.account ?? null };
      e.n++; byName.set(key, e);
      if (cat) s.named++;
      const g = suggest({ desc: r.desc, cents: r.cents }, { rules: [], codes: null, skip: new Set(skip) });
      if (!g || !g.account) continue;
      s.kw++;
      if (!cat) { s.kwNoCat++; continue; }
      if (g.account === cat.account) s.kwAgree++;
      else {
        s.kwDisagree++;
        const k = `${g.account} (${g.source}) vs ${cat.account}: ${String(r.desc).slice(0, 30)} | ${key.slice(0, 40)}`;
        disagree.set(k, (disagree.get(k) ?? 0) + 1);
      }
    }
  }
  const unmapped = [...byName.values()].filter((e) => !e.account).sort((a, b) => b.n - a.n).slice(0, top);
  const worst = [...disagree.entries()].sort((a, b) => b[1] - a[1]).slice(0, top);
  return { ...s, names: byName.size, mappedNames: [...byName.values()].filter((e) => e.account).length, unmapped, worst };
}

const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + "%" : "-");

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const mode = argv[0];
  const dirs = [], skip = [];
  let top = 40;
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--dir") dirs.push(argv[++i]);
    else if (argv[i] === "--skip") skip.push(argv[++i]);
    else if (argv[i] === "--top") top = Number(argv[++i]);
  }
  const files = filesIn(dirs);
  if (mode === "read") {
    const t = readCheck(files);
    console.log(`${t.files} files, ${t.lines} lines; ${t.ok} files read exactly`);
    for (const b of t.bad) console.log("  " + JSON.stringify(b));
  } else if (mode === "names") {
    const t = namesCheck(files, { skip, top });
    console.log(`${t.lines} charges; category name gives an account on ${pct(t.named, t.lines)} (${t.mappedNames} of ${t.names} distinct names)`);
    console.log(`name-only layers spoke on ${pct(t.kw, t.lines)}; where the category also spoke: agree ${t.kwAgree}, disagree ${t.kwDisagree} (${pct(t.kwAgree, t.kwAgree + t.kwDisagree)} agree); spoke where the category was silent: ${t.kwNoCat}`);
    console.log("commonest names with no account:");
    for (const e of t.unmapped) console.log(`  ${String(e.n).padStart(7)}  ${e.raw}`);
    console.log("commonest disagreements:");
    for (const [k, n] of t.worst) console.log(`  ${String(n).padStart(6)}  ${k}`);
  } else console.log("usage: node eval/oklahoma-pcard.mjs read|names --dir <folder> ...");
}
