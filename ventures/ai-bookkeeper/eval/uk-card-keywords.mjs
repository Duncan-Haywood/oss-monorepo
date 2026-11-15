// The built-in keywords from empty books on three UK public buyers' card lines: what a
// first import suggests before the books have any history and with no merchant category
// code read. Each buyer's own script fetches and maps the data (licence and fetch
// commands there); this one only reads the merchant name.
//
//   node eval/uk-card-keywords.mjs --sl <South Lakeland dir> --durham <Durham dir> \
//        --scot <govspend.opendata.scot/_data/spendsOver500> [--misses 20] [--blanks 20] [--skip brand]
//
// South Lakeland (eval/southlakeland-pcard.mjs) is the buyer the 2026-11-15 UK merchant
// block was written from; Durham (eval/durham-pcard.mjs) and the Scottish Government
// (eval/scotgov-card.mjs) were scored before the block was written, then read for its misses
// (README "UK merchants in the built-in keywords" gives both readings).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { suggest } from "../categorize.mjs";
import { loadDir as loadSL } from "./southlakeland-pcard.mjs";
import { loadDurham, decode } from "./durham-pcard.mjs";
import { loadDir as loadScot } from "./scotgov-card.mjs";
import { pathToFileURL } from "node:url";

const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + "%" : "-");

// Every line from empty books, the merchant name only. `merchants` counts each distinct
// name once (its first line), which is closer to what a reader of the table sees.
export function cold(rows, skip = new Set()) {
  const lines = { n: 0, right: 0, wrong: 0, blank: 0 }, merchants = { n: 0, right: 0, wrong: 0, blank: 0 };
  const misses = new Map(), blanks = new Map(), seen = new Set();
  for (const r of rows) {
    const s = suggest({ desc: r.desc, cents: r.cents }, { rules: [], codes: null, skip });
    const k = r.desc.toLowerCase().replace(/\s+/g, " ").trim();
    const kind = !s.account ? "blank" : r.want.includes(s.account) ? "right" : "wrong";
    lines.n++; lines[kind]++;
    if (!seen.has(k)) { seen.add(k); merchants.n++; merchants[kind]++; }
    if (kind === "blank") blanks.set(k, (blanks.get(k) ?? 0) + 1);
    if (kind === "wrong") { const m = `${r.want.join("/")} got ${s.account} (${s.reason}) | ${k}`; misses.set(m, (misses.get(m) ?? 0) + 1); }
  }
  return { lines, merchants, misses, blanks };
}

const line = (o) => `n=${o.n} right ${pct(o.right, o.n)} wrong ${pct(o.wrong, o.n)} blank ${pct(o.blank, o.n)}`;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i === -1 ? d : process.argv[i + 1]; };
  const buyers = [];
  if (arg("--sl")) buyers.push(["South Lakeland (written from)", loadSL(arg("--sl")).rows]);
  if (arg("--durham")) {
    const dir = arg("--durham");
    const texts = readdirSync(dir).filter((f) => /\.csv$/i.test(f)).sort().map((f) => decode(readFileSync(join(dir, f))));
    buyers.push(["Durham (scored first, then read)", loadDurham(texts)]);
  }
  if (arg("--scot")) buyers.push(["Scottish Government (scored first, then read)", loadScot(arg("--scot"))]);
  for (const [name, rows] of buyers) {
    const o = cold(rows, new Set((arg("--skip") ?? "").split(",").filter(Boolean)));
    console.log(`${name}`);
    console.log(`  lines      ${line(o.lines)}`);
    console.log(`  merchants  ${line(o.merchants)}`);
    const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).forEach(([k, c]) => console.log(`    x${c} ${k}`));
    if (+arg("--misses", 0)) top(o.misses, +arg("--misses"));
    if (+arg("--blanks", 0)) top(o.blanks, +arg("--blanks"));
  }
}
