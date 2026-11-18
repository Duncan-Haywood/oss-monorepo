// The built-in keywords on a fourth card buyer, one with no merchant category code:
// South Lakeland District Council's monthly procurement-card report (England,
// 2014-2019). Each line has the merchant ("Supplier"), the amount, a free-text
// purpose and the council's own procurement classification ("ProClass" label, the
// local-government purchasing taxonomy). There is no card-network code, so this
// measures what the bank-line layers (built-in keywords, the books' own memory,
// the classifier and the new-payee guess) do on a buyer they were not built on.
//
// The purpose column ("Train to/from Birmingham for planning event") would give the
// answer away and is not on a bank or card line, so only the supplier is read.
//
// The data is South Lakeland District Council's, published under the Open
// Government Licence v3.0 and listed on data.gov.uk (the council merged into
// Westmorland and Furness in 2023; the files still answer). Nothing is copied here.
// Fetch:
//
//   mkdir sl && cd sl
//   curl -sL https://www.data.gov.uk/dataset/f861f881-8716-4e03-8939-b087e97537af/government-procurement-card-transactions \
//     | grep -oE 'https?://[^"]+\.csv' | sort -u | while read u; do curl -sLO "$u"; done
//   node eval/southlakeland-pcard.mjs --dir sl [--skip built-in|memory|learned|new-payee] [--misses 30] [--blanks 30]
//
// The run of 2026-11-15 read 54 monthly files (July 2014 to November 2019).
//
// Each line is replayed a day at a time from empty books (eval/scotgov-card.mjs
// `replay`). Only classes that name a chart account (CLASS_MAP below, written from
// the class names before the first scored run) are scored; "Not Elsewhere
// Classified", "Sundries", "Commercial", "Products", "Services", "Housing",
// "Security", "Events", "Human Resources", recruitment, letting agents, care
// supplies and the like are left out.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseCsv } from "../bank.mjs";
import { replay, fmt } from "./scotgov-card.mjs";
import { suggest } from "../categorize.mjs";
import { pathToFileURL } from "node:url";

// ProClass label (lower case) -> chart accounts a careful bookkeeper could accept.
// Equipment may be expensed or capitalised; tools and materials may be supplies or
// repairs; travel subsistence may be travel or meals.
export const CLASS_MAP = new Map(Object.entries({
  "training & conferences": ["6170", "6120"],
  "training and conferences": ["6170", "6120"],
  "subscriptions": ["6170", "6060"],
  "periodicals": ["6170", "6070"],
  "accommodation": ["6120"],
  "public transport": ["6120"],
  "passenger transport": ["6120"],
  "travel & subsistence": ["6120", "6130"],
  "parking": ["6120", "6160"],
  "food & beverages": ["6130", "6100"],
  "catering": ["6130", "6100"],
  "banquet & catering": ["6130"],
  "consumables": ["6100", "6070"],
  "cleaning materials": ["6100"],
  "equipment & utensils": ["6100", "1500"],
  "hardware": ["6100", "6070", "1500", "6090"],
  "hand tools": ["6100", "1500", "6090"],
  "tools & equipment": ["6100", "1500", "6090"],
  "paint & finishing": ["6100", "6090"],
  "general materials": ["6100", "6090"],
  "electrical": ["6100", "6090"],
  "lighting": ["6100", "6090"],
  "highway equipment & materials": ["6100", "6090"],
  "domestic goods": ["6100"],
  "soft furnishings": ["6100"],
  "domestic furniture": ["6100", "1500"],
  "protective": ["6100"],
  "uniforms": ["6100"],
  "footwear": ["6100"],
  "clothing": ["6100"],
  "health & safety": ["6100"],
  "laundry equipment": ["6100", "1500"],
  "sports equipment": ["6100", "1500"],
  "technical equipment": ["6100", "1500"],
  "signage": ["6100", "6000"],
  "stationery": ["6070"],
  "stationery sundries": ["6070"],
  "paper": ["6070"],
  "office & reprographics equipment": ["6070", "1500"],
  "office furniture": ["6070", "1500"],
  "postage": ["6070", "6180"],
  "couriers": ["6180", "6070"],
  "playground equipment maintenance": ["6090", "6100"],
  "sports & playground equipment & maintenance": ["6090", "6100"],
  "maintenance": ["6090", "6100"],
  "vehicle management": ["6160", "6090"],
  "fuel": ["6160"],
  "parts": ["6160", "6090", "6100"],
  "advertising": ["6000"],
  "telecommunications": ["6140"],
  "electricity": ["6140"],
  "gas": ["6140"],
  "software": ["6060"],
  "information communication technology": ["6060", "6070", "6100", "1500"],
  "insurance": ["6030"],
  "financial services": ["6010"],
  "professional & advisory services": ["6050"],
  "accountancy": ["6050", "6170"],
  "debt collection & recovery": ["6050"],
  "testing & inspection": ["6050", "6090"],
  "storage": ["6080"],
}));

const dmy = (s) => { const [d, m, y] = String(s).split("/"); return y && m && d ? `${y.length === 2 ? "20" + y : y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` : ""; };

function decode(buf) {
  const t = buf.toString("utf8");
  return t.includes("�") ? buf.toString("latin1") : t.replace(/^\uFEFF/, "");
}

// Rows from every CSV in dir, oldest first. Lines with a class outside CLASS_MAP,
// refunds and blank rows are dropped; `stats` counts what was read.
export function loadDir(dir) {
  const rows = [], stats = { files: 0, lines: 0, classed: 0, mapped: 0, refunds: 0 };
  for (const f of readdirSync(dir).filter((f) => /\.csv$/i.test(f)).sort()) {
    const grid = parseCsv(decode(readFileSync(join(dir, f))));
    const head = grid[0]?.map((h) => String(h).trim()) ?? [];
    const col = (re) => head.findIndex((h) => re.test(h));
    const iSup = col(/^supplier$/i), iDate = col(/^paymentdate$/i), iAmt = col(/^netamount$/i), iCls = col(/proclasslabel/i);
    if ([iSup, iDate, iAmt, iCls].includes(-1)) continue;
    stats.files++;
    for (const r of grid.slice(1)) {
      const desc = String(r[iSup] ?? "").trim(), date = dmy(r[iDate]);
      const amount = Number(String(r[iAmt] ?? "").replace(/[£,\s]/g, ""));
      if (!desc || !date || !Number.isFinite(amount)) continue;
      stats.lines++;
      const cls = String(r[iCls] ?? "").trim().toLowerCase();
      if (cls) stats.classed++;
      const want = CLASS_MAP.get(cls);
      if (!want) continue;
      if (amount <= 0) { stats.refunds++; continue; }
      stats.mapped++;
      rows.push({ desc, date, cents: -Math.round(amount * 100), mcc: "", want, cls });
    }
  }
  return { rows: rows.sort((a, b) => a.date.localeCompare(b.date)), stats };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i === -1 ? d : process.argv[i + 1]; };
  const { rows, stats } = loadDir(arg("--dir"));
  const skip = new Set((arg("--skip") ?? "").split(",").filter(Boolean));
  const o = replay(rows, { skip });
  console.log(`${stats.files} files, ${stats.lines} lines, ${stats.classed} with a class, ${stats.mapped} scored (${stats.refunds} refunds left out)${skip.size ? `; off: ${[...skip].join(",")}` : ""}`);
  console.log(`  all          ${fmt(o.all)}`);
  console.log(`  first seen   ${fmt(o.first)}`);
  console.log(`  seen before  ${fmt(o.repeat)}`);
  const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + "%" : "-");
  console.log(`  first seen by source: ${Object.entries(o.firstBySource).map(([k, v]) => `${k} ${v.n} (${pct(v.right, v.n)} right)`).join(", ")}`);
  // The built-in keywords alone, every line from empty books: what a first import gets.
  const cold = { n: 0, right: 0, wrong: 0, blank: 0 }, misses = [], blanks = new Map();
  for (const r of rows) {
    const s = suggest({ desc: r.desc, cents: r.cents }, { rules: [], codes: null, skip });
    cold.n++;
    if (!s.account) { cold.blank++; blanks.set(r.desc.toLowerCase(), (blanks.get(r.desc.toLowerCase()) ?? 0) + 1); }
    else if (r.want.includes(s.account)) cold.right++;
    else { cold.wrong++; misses.push(`${r.want.join("/")} got ${s.account} (${s.source}) | ${r.cls} | ${r.desc}`); }
  }
  console.log(`  empty books, every line: ${fmt(cold)}`);
  if (+arg("--misses", 0)) misses.slice(0, +arg("--misses")).forEach((m) => console.log(`    ${m}`));
  if (+arg("--blanks", 0)) [...blanks].sort((a, b) => b[1] - a[1]).slice(0, +arg("--blanks")).forEach(([k, n]) => console.log(`    x${n} ${k}`));
}
