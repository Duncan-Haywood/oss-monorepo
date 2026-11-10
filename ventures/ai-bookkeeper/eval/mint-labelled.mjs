// Labelled bank text: public Mint exports on GitHub. Each row carries the raw bank
// descriptor ("Original Description") and the category Mint assigned or the user corrected.
// Open Collective's labelled books (eval/opencollective-labelled.mjs) carry memos and payee
// names, not bank text, and that host was unreachable from a later session; this is the
// bank-line counterpart and the reading for "a payee seen for the first time".
//
//   node eval/mint-labelled.mjs [--set tune|held|all] [--misses 40] [--cache DIR]
//
// Files are fetched at run time from raw.githubusercontent.com at pinned commits and cached
// under --cache (default the OS temp dir); never copied into the repository. They are
// personal spending, so only aggregates are reported in docs. Labels are Mint's own
// categoriser plus whatever the owner corrected: agreement with Mint, a commercial
// merchant database, not a bookkeeper's answer key.
//
// Only money out is scored, and only Mint categories that name one chart account
// (MINT_MAP); groceries, shopping, transfers and personal categories are left unscored.
// The Category column is never shown to the categoriser.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { suggest, trainClassifier, buildMemory, historyRecord, payeeKey } from "../categorize.mjs";

// [set, repo, commit, path]. "tune": rules may be written looking at these; "held": never.
export const FILES = [
  ["tune", "corbinpage/budget-play-app", "20f1f6d56bee26eae8d6e4c1437c8ccde4dc23c0", "db/2016/transactions.csv"],
  ["tune", "shreyasrye/weav-series", "f6f8d3b06532bf9764120de23214851c65eb9ef6", "datasets/pr_transactions.csv"],
  ["tune", "jegood78/Financial_Planning", "b0ec46a66f0633bf5544be1423fef18db8377111", "mint_transactions.csv"],
  ["tune", "atkinsvh/FlaskAppPortfolio", "8679b1225b2033f8eb61febb6b702d41fee3a5f8", "FlaskApp/transactions.csv"],
  ["held", "CS222-UIUC/course-project-group-106", "e5f24fc35b4d5343d291abdecf7e1db8d35308a2", "data/transactions.csv"],
  ["held", "candu/quantified-savagery-files", "24c0995a0c2cbf4f94cca4b1698932e76aa52996", "Financial/mint-bubbles/transactions.csv"],
  ["held", "jettjz/XpendiBuddy", "161b67f1712f4a331bb3ed3f768b8a33567a699b", "server/transactions.csv"],
  ["held", "morisy/crowdpleaser", "7365ea4e22b768332e981b474a6b57bc01f59c3b", "media/csv_files/jan_2023.csv"],
  ["held", "FDA-AI/FDAi", "9edc265e721900525d8269c7369dcefcfc6aba8d", "apps/dfda-1/tests/UnitTests/SpreadsheetImporters/mint-spreadsheet-fixture.csv"],
  ["held", "casparcc/casparcc.github.io", "bf7ceddbe8eb71a94e0e37dd254117d29b540eab", "assets/csv/CheckingTransactionsThruFeb4.csv"],
];

// Mint category -> chart accounts a careful bookkeeper could accept.
export const MINT_MAP = {
  "Restaurants": ["6130"], "Fast Food": ["6130"], "Coffee Shops": ["6130"], "Food Delivery": ["6130"],
  "Food & Dining": ["6130"], "Alcohol & Bars": ["6130"], "Restaurantss": ["6130"],
  "Air Travel": ["6120"], "Hotel": ["6120"], "Travel": ["6120"], "Rental Car & Taxi": ["6120", "6160"],
  "Ride Share": ["6120", "6160"], "Public Transportation": ["6120", "6160"], "Taxi": ["6120", "6160"],
  "Gas & Fuel": ["6160"], "Parking": ["6160", "6120"], "Auto Insurance": ["6030", "6160"], "Service & Parts": ["6160", "6090"],
  "Auto Payment": ["6160", "2200"], "Tolls": ["6160", "6120"],
  "Utilities": ["6140"], "Mobile Phone": ["6140"], "Internet": ["6140"], "Television": ["6140", "6060"],
  "Bank Fee": ["6010"], "ATM Fee": ["6010"], "Service Fee": ["6010"], "Fees & Charges": ["6010"], "Late Fee": ["6010"],
  "Finance Charge": ["6040", "6010"], "Insurance": ["6030"], "Home Insurance": ["6030"], "Life Insurance": ["6030"],
  "Office Supplies": ["6070"], "Shipping": ["6180", "6070"], "Advertising": ["6000"], "Legal": ["6050"],
  "Books & Supplies": ["6070", "6170"], "Tuition": ["6170"], "Education": ["6170"],
  "Business Services": ["6050", "6020", "6060"], "Printing": ["6070", "6000"],
  "Federal Tax": ["6110"], "State Tax": ["6110"], "Taxes": ["6110"],
  "Rent": ["6080"], "Mortgage & Rent": ["6080"], "Home Improvement": ["6090", "6100"], "Hardware": ["6100", "6090"],
};

export function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// Mint CSV text -> [{ date (ISO), desc, cat, out }].
export function mintRows(text) {
  const [head, ...body] = parseCsv(text.replace(/^﻿/, "")).filter((r) => r.some((c) => c.trim()));
  const ix = (n) => head.findIndex((h) => h.trim().toLowerCase() === n);
  const D = ix("date"), O = ix("original description"), S = ix("description"), C = ix("category"), T = ix("transaction type");
  return body.map((r) => {
    const m = String(r[D] ?? "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    const y = m ? (m[3].length === 2 ? "20" + m[3] : m[3]) : "";
    return { date: m ? `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : String(r[D] ?? ""), desc: String(r[O] || r[S] || "").trim(), cat: String(r[C] ?? "").trim(), out: String(r[T] ?? "").trim().toLowerCase() === "debit" };
  }).filter((r) => r.desc);
}

export async function fetchFile([, repo, sha, path], dir) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${repo.replace("/", "_")}_${sha.slice(0, 8)}.csv`);
  if (!existsSync(file)) {
    const res = await fetch(`https://raw.githubusercontent.com/${repo}/${sha}/${path.split("/").map(encodeURIComponent).join("/")}`);
    if (!res.ok) throw new Error(`${repo}: HTTP ${res.status}`);
    writeFileSync(file, await res.text());
  }
  return readFileSync(file, "utf8");
}

const blank = () => ({ n: 0, right: 0, wrong: 0, auto: 0, autoWrong: 0 });
function tally(o, s, want) {
  o.n++;
  if (s.account && want.includes(s.account)) o.right++; else if (s.account) o.wrong++;
  if ((s.source === "memory" || s.source === "rule") && s.confidence >= 0.85) { o.auto++; if (!want.includes(s.account)) o.autoWrong++; }
}

// One file = one person's books, replayed month by month like the import loop.
export function evaluate(rows, { learn = true, map = MINT_MAP } = {}) {
  const scored = rows.filter((r) => r.out && map[r.cat]).sort((a, b) => a.date.localeCompare(b.date));
  const all = blank(), first = blank(), repeat = blank(), misses = [], bySource = {};
  const hist = [], seen = new Set();
  let model = { rules: [], codes: null, memory: buildMemory([]), classifier: { n: 0 } }, month = null, pending = [];
  const flush = () => { if (!learn || !pending.length) return; hist.push(...pending); pending = []; model = { rules: [], codes: null, memory: buildMemory(hist), classifier: trainClassifier(hist) }; };
  for (const r of scored) {
    if (r.date.slice(0, 7) !== month) { flush(); month = r.date.slice(0, 7); }
    const want = map[r.cat], txn = { desc: r.desc, cents: -1000 };
    const s = suggest(txn, model);
    tally(all, s, want);
    const k = payeeKey(r.desc);
    tally(seen.has(k) ? repeat : first, s, want);
    const src = (bySource[s.source] ??= { n: 0, right: 0 }); src.n++; if (s.account && want.includes(s.account)) src.right++;
    if (!seen.has(k) && !(s.account && want.includes(s.account))) misses.push({ cat: r.cat, got: s.account, desc: r.desc });
    seen.add(k);
    pending.push(historyRecord(txn, want[0]));
  }
  return { rows: rows.length, scored: scored.length, all, first, repeat, bySource, misses };
}

const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + "%" : "-");
export const line = (o) => `n=${o.n} right ${pct(o.right, o.n)} wrong ${pct(o.wrong, o.n)} (right of suggested ${pct(o.right, o.right + o.wrong)}) auto ${pct(o.auto, o.n)} (wrong ${o.autoWrong})`;
const add = (a, b) => { for (const k of Object.keys(a)) a[k] += b[k]; };

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i === -1 ? d : process.argv[i + 1]; };
  const set = arg("--set", "all"), dir = arg("--cache", join(tmpdir(), "mint-labelled"));
  const tot = { cold: blank(), coldFirst: blank(), online: blank(), first: blank(), repeat: blank() }, misses = [];
  for (const f of FILES.filter((f) => set === "all" || f[0] === set)) {
    const rows = mintRows(await fetchFile(f, dir));
    const c = evaluate(rows, { learn: false }), o = evaluate(rows);
    add(tot.cold, c.all); add(tot.coldFirst, c.first); add(tot.online, o.all); add(tot.first, o.first); add(tot.repeat, o.repeat);
    misses.push(...o.misses);
    console.log(`${f[0]} ${f[1].padEnd(36)} rows ${rows.length} scored ${c.scored}  cold ${pct(c.all.right, c.all.n)}  online ${pct(o.all.right, o.all.n)}  first-seen ${pct(o.first.right, o.first.n)} (n=${o.first.n})`);
  }
  console.log(`\n${set}: keywords alone, every line   ${line(tot.cold)}`);
  console.log(`${set}: keywords alone, first-seen   ${line(tot.coldFirst)}`);
  console.log(`${set}: online, every line          ${line(tot.online)}`);
  console.log(`${set}: online, first-seen payee    ${line(tot.first)}`);
  console.log(`${set}: online, seen before         ${line(tot.repeat)}`);
  if (+arg("--misses", 0)) {
    const m = new Map();
    for (const x of misses) { const k = `${x.cat} | got ${x.got} | ${x.desc.slice(0, 50)}`; m.set(k, (m.get(k) ?? 0) + 1); }
    [...m].sort((a, b) => b[1] - a[1]).slice(0, +arg("--misses")).forEach(([k, n]) => console.log(`  x${n} ${k}`));
  }
}
