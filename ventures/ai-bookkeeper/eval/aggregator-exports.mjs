// Labelled bank lines from the two budgeting apps that replaced Mint: a Monarch export and a
// Rocket Money export that people committed to public GitHub repositories. Each row carries the
// app's category (its own guess or the owner's correction) beside the merchant or the raw card
// descriptor. The Rocket Money file is one firm's American Express card (a small brand agency,
// March to June 2024), the first real business card in the labelled sets; the Monarch file is one
// household's 2025 accounts. Neither carries a licence we can copy under and both hold names and
// account digits, so they are fetched at run time at pinned commits into a cache directory and
// never committed; only counts are kept in the README.
//
//   node eval/aggregator-exports.mjs [--cache DIR] [--misses N] [--skip layer,layer]
//
// Per file: how the reader reads it (layout, money out and in, accounts), then the categorizer
// replayed day by day against the app's labels with the Category column blanked first, so it
// never sees the label it is scored against. Only money out in categories that name one chart
// account is scored (APP_MAP); shopping, groceries, transfers and personal categories are left
// out. "First-seen" lines are those whose payee key had not been filed before.
//
// Labels are agreement with a consumer budgeting app, not a bookkeeper's answer key.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { readStatement } from "../bank.mjs";
import { suggest, trainClassifier, buildMemory, trainNewPayee, historyRecord, payeeKey } from "../categorize.mjs";
import { hideColumn } from "./mercury-exports.mjs";

// [app, repo, commit, path]
export const SOURCES = [
  ["rocket-money", "Interact-Brands/finance-reporting", "1ea6a024ada77db34c5839664defc270817e0b96", "rocketmoney.csv"],
  ["monarch", "jegood78/Financial_Planning", "b0ec46a66f0633bf5544be1423fef18db8377111", "monarch_transactions.csv"],
  // Copilot Money (added 2026-11-15): a household's 2026 accounts with its own joint and personal
  // categories, and one person's 2022-2024 cards and checking on Copilot's default categories.
  ["copilot-money", "gilbertosg/second-brain", "0937683b059a7c67646379800617690254e69d5f", "L5-Finance/transactions-2026-jan-oct.csv"],
  ["copilot-money", "ultraspicy/CS-230", "2a02dd6b66169baabd7d3cdcca7206aee413a6f6", "final_project/resources/transactions_exported_from_copilot.csv"],
];

// App category -> chart accounts a careful bookkeeper could accept (first is the one filed).
export const APP_MAP = {
  // Rocket Money
  "Dining & Drinks": ["6130"], "Travel & Vacation": ["6120"], "Auto & Transport": ["6120", "6160"],
  "Software & Tech": ["6060"], "Fees": ["6010"], "Education": ["6170"],
  // Monarch
  "Restaurants & Bars": ["6130"], "Gas": ["6160"], "Parking & Tolls": ["6160", "6120"],
  "Auto Maintenance": ["6160", "6090"], "Gas & Electric": ["6140"], "Internet & Cable": ["6140"],
  "Phone": ["6140"], "Water": ["6140"], "Business Utilities & Communication": ["6140", "6060"],
  "Insurance": ["6030"], "Rent": ["6080"], "Postage & Shipping": ["6180", "6070"], "Taxes": ["6110"],
  "Home Improvement": ["6090", "6100"], "Financial & Legal Services": ["6050", "6010"],
  // Copilot Money: its defaults (second file) and the first file's own names for the same things.
  // "Subscriptions" there is a household's streaming and apps as much as software, so it is scored
  // against software and subscriptions (the chart's one account for it) all the same.
  // "Car & Gas" holds tolls and parking too, so it takes vehicle or travel, as Rocket Money's "Auto & Transport" does.
  "Restaurants": ["6130"], "Car & Gas": ["6160", "6120"], "Subscriptions": ["6060"], "Utilities": ["6140"],
  "Restaurants - Joint": ["6130"], "Bar & Restaurants Gil": ["6130"], "Bar & Restaurants Lu": ["6130"],
  "Bars & Nightlife - Joint": ["6130"], "Car + Gas": ["6160", "6120"], "Travel & Vacation Joint": ["6120"],
  "Travel & Vacation Lu": ["6120"], "Travel & Vacation Gil": ["6120"], "Transportation (Uber)": ["6120", "6160"],
  "Phones": ["6140"], "Electricity": ["6140"],
};

export async function fetchSource([, repo, sha, path], dir) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${repo.replace("/", "_")}_${sha.slice(0, 8)}_${path.replace(/\W+/g, "_").slice(-40)}`);
  if (!existsSync(file)) {
    const res = await fetch(`https://raw.githubusercontent.com/${repo}/${sha}/${path.split("/").map(encodeURIComponent).join("/")}`);
    if (!res.ok) throw new Error(`${repo}: HTTP ${res.status}`);
    writeFileSync(file, await res.text());
  }
  return readFileSync(file, "utf8");
}

// Replay money-out lines in date order; after each day, file what was seen to the label's
// account, as a bookkeeper confirming the review queue would.
export function replay(rows, labels, { skip = null, map = APP_MAP } = {}) {
  const lines = rows.map((r) => ({ ...r, label: labels[r.line - 1], want: map[labels[r.line - 1]] }))
    .filter((r) => r.want && r.cents < 0).sort((a, b) => a.date.localeCompare(b.date) || a.line - b.line);
  const blank = () => ({ n: 0, right: 0, wrong: 0 });
  const all = blank(), first = blank(), byLayer = {}, misses = [], hist = [], seen = new Set();
  let model = { rules: [], codes: null, memory: buildMemory([]), classifier: { n: 0 }, newPayee: null }, day = null, pending = [];
  const flush = () => { if (!pending.length) return; hist.push(...pending); pending = []; model = { rules: [], codes: null, memory: buildMemory(hist), classifier: trainClassifier(hist), newPayee: trainNewPayee(hist) }; };
  for (const r of lines) {
    if (r.date !== day) { flush(); day = r.date; }
    const txn = { desc: r.desc, cents: r.cents, ...(r.mcc ? { mcc: r.mcc } : {}) };
    const s = suggest(txn, skip ? { ...model, skip } : model);
    const k = payeeKey(r.desc), ok = s.account && r.want.includes(s.account);
    for (const o of seen.has(k) ? [all] : [all, first]) { o.n++; if (ok) o.right++; else if (s.account) o.wrong++; }
    if (s.account) { const L = (byLayer[s.source] ??= blank()); L.n++; if (ok) L.right++; else L.wrong++; }
    if (!ok) misses.push({ first: !seen.has(k), line: `${r.label} | got ${s.account ?? "-"} (${s.source ?? ""}) | ${r.desc}` });
    seen.add(k);
    pending.push(historyRecord(txn, r.want[0]));
  }
  return { all, first, byLayer, misses };
}

// The built-in keywords alone on every scored line (no memory, no learning).
export function keywordsAlone(rows, labels, map = APP_MAP) {
  const o = { n: 0, right: 0, wrong: 0 };
  for (const r of rows) {
    const want = map[labels[r.line - 1]];
    if (!want || r.cents >= 0) continue;
    const s = suggest({ desc: r.desc, cents: r.cents }, { rules: [], codes: null, memory: buildMemory([]), classifier: { n: 0 }, newPayee: null });
    o.n++; if (s.account && want.includes(s.account)) o.right++; else if (s.account) o.wrong++;
  }
  return o;
}

const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + "%" : "-");
export const fmt = (o) => `${pct(o.right, o.n)} right / ${pct(o.wrong, o.n)} wrong of ${o.n}`;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i === -1 ? d : process.argv[i + 1]; };
  const dir = arg("--cache", join(tmpdir(), "aggregator-exports"));
  const nMiss = Number(arg("--misses", 0));
  const skip = arg("--skip", "") ? new Set(arg("--skip", "").split(",")) : null;
  for (const src of SOURCES) {
    const raw = await fetchSource(src, dir);
    const full = readStatement(raw);
    const { text, labels } = hideColumn(raw, "Category");
    const read = readStatement(text);
    const out = read.rows.filter((r) => r.cents < 0).length;
    console.log(`${src[0].padEnd(13)} ${src[1]}: layout ${full.bank}, ${read.rows.length} rows (${out} out, ${read.rows.length - out} in), ${read.problems.length} problems, accounts ${read.accountNames?.length ?? 1}; app's category kept on ${full.rows.filter((r) => r.bankCat).length}`);
    if (full.inferred) console.log(`              ${full.inferred}`);
    const typeIx = text.split(/\r?\n/)[0].toLowerCase().split(",").map((c) => c.replace(/"/g, "").trim()).indexOf("type");
    if (src[0] === "copilot-money" && typeIx !== -1) {
      // Lines Copilot typed "internal transfer": what the categorizer, with no history, files them to.
      const kinds = {};
      for (const r of read.rows) {
        if (r.bankCat !== "Internal Transfer") continue;
        const s = suggest({ desc: r.desc, cents: r.cents, bankCat: r.bankCat }, { rules: [], codes: null, memory: buildMemory([]), classifier: { n: 0 }, newPayee: null });
        const k = s.account === "transfer" ? "transfer" : s.account ? "an expense or income account" : "review";
        kinds[k] = (kinds[k] ?? 0) + 1;
      }
      console.log(`              Copilot's internal transfers (${Object.values(kinds).reduce((a, b) => a + b, 0)}), filed with no history: ${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(", ")}`);
    }
    console.log(`              keywords alone: ${fmt(keywordsAlone(read.rows, labels))}`);
    const r = replay(read.rows, labels, { skip });
    console.log(`              learning loop, every line: ${fmt(r.all)}`);
    console.log(`              learning loop, first-seen payee: ${fmt(r.first)}`);
    console.log(`              by layer: ${Object.entries(r.byLayer).map(([k, v]) => `${k} ${v.right}/${v.n}`).join(", ")}`);
    if (nMiss) {
      const tally = {};
      for (const m of r.misses.filter((m) => m.first)) tally[m.line] = (tally[m.line] ?? 0) + 1;
      for (const [l, n] of Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, nMiss)) console.log(`                ${n}x ${l}`);
    }
  }
}
