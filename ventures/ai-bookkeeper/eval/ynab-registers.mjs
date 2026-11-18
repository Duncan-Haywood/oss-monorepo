// Labelled bank lines from YNAB register exports that people committed to public GitHub
// repositories. A YNAB register carries the owner's own category beside YNAB's cleaned payee
// name ("Seattle City Light", not "SEATTLE CITY LIGHT 206-684-3000 WA"), so it tests the
// built-in keywords and the learning loop on the names a budgeting app has already tidied,
// with a label the household chose itself rather than an app's guess. Three households:
// a Seattle family's 42 accounts (December 2024 to May 2025), a Utah couple's five (April to
// September 2025) and a Chicago renter's six (June to July 2026). None carries a licence we
// can copy under and all hold names, so they are fetched at run time at pinned commits into
// a cache directory and never committed; only counts are kept in the README.
//
//   node eval/ynab-registers.mjs [--cache DIR] [--misses N] [--skip layer,layer]
//
// Category names are the household's own, often with an emoji in front; the emoji is
// stripped before the lookup. Only money out in categories that name one chart account is
// scored (YNAB_MAP); groceries, gifts, allowances, trips named after a person and medical
// lines are left out because no business chart account fits them. Transfers between the
// household's own accounts ("Transfer : Kia Loan") are left out too.
//
// Labels are a household's budget categories, not a bookkeeper's answer key.
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { readStatement } from "../bank.mjs";
import { hideColumn } from "./mercury-exports.mjs";
import { fetchSource, replay, keywordsAlone, fmt } from "./aggregator-exports.mjs";

// [name, repo, commit, path]
export const SOURCES = [
  ["seattle", "philgetzen/my-finance-dashboard", "99e0fce4721c73940a273a6ad105cf6fe9b9a49b", "Data/YNAB-Selected Transactions-May-28-2025.csv"],
  ["utah", "MWestberg3/budget-analysis-chatbot", "8ebae39659554c74c54aa3938e6059cf8cab6f0d", "ynab-reflect-spending-breakdown-2025-09-01-transactions.csv"],
  ["chicago", "mrmikwebber/BlankSlate", "faf0850f5cd938cd6dd4d2dc437aa582562c32c8", "blankslate-register-2026-07-22.csv"],
];

// Household category (emoji stripped) -> chart accounts a careful bookkeeper could accept.
export const YNAB_MAP = {
  // Meals
  "Dining Out": ["6130"], "Dining out": ["6130"], "Dining Out / Takeout": ["6130"], "Bars": ["6130"],
  "Coffee Shop & Pastries": ["6130"],
  // Vehicle, travel and transit
  "Family Car General Expenses": ["6160", "6120", "6090"], "Phil Car General Expenses": ["6160", "6120", "6090"],
  "Gas": ["6160"], "Car Maintenance": ["6090", "6160"], "Tires": ["6160", "6090"],
  "Auto registration": ["6110", "6160"],
  "Travel": ["6120", "6130", "6160"], "Public Transit": ["6120"], "Fun Transport": ["6120"],
  // Insurance
  "Car & Umbrella Insurance": ["6030"], "Auto Insurance": ["6030"], "Dani Life Insurance": ["6030"],
  // Utilities and phone
  "Electric & Gas": ["6140"], "Electricity": ["6140"], "Utilities": ["6140"], "Internet & Cable": ["6140"],
  "Wifi": ["6140"], "Phone Bill": ["6140"], "Phone": ["6140"], "Michael's Phone": ["6140"],
  // Software and subscriptions
  "Websites (AWS)": ["6060"], "Spotify": ["6060"], "Audible": ["6060"], "YouTube Premium": ["6060"],
  "iCloud 2TB Family": ["6060"], "Peloton": ["6060"], "Subscriptions": ["6060"], "Random Subscription": ["6060"],
  "YNAB subscription": ["6060"], "YNAB": ["6060"],
  // Rent, wages, interest and fees
  "Rent": ["6080"], "Nanny Salary": ["6150", "6020"],
  "Interest & Fees": ["6010", "6040"], "Interest": ["6040", "6010"],
};

// "🚙 Subaru Payment" -> "Subaru Payment": drop leading symbols, emoji and joiners.
export const plainCategory = (s) => String(s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();

// The register with every column that names the category blanked, plus the labels by line.
export function hideCategories(raw) {
  let text = raw, labels = null;
  for (const col of ["Category Group/Category", "Category Group", "Category"]) {
    const h = hideColumn(text, col);
    text = h.text;
    if (col === "Category") labels = h.labels.map(plainCategory);
  }
  return { text, labels };
}

// Money-out rows that are not a transfer between the household's own accounts.
export const scoredRows = (rows) => rows.filter((r) => !/^transfer\s*:/i.test(r.desc));

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i === -1 ? d : process.argv[i + 1]; };
  const dir = arg("--cache", join(tmpdir(), "ynab-registers"));
  const nMiss = Number(arg("--misses", 0));
  const skip = arg("--skip", "") ? new Set(arg("--skip", "").split(",")) : null;
  const tot = { kw: { n: 0, right: 0, wrong: 0 }, all: { n: 0, right: 0, wrong: 0 }, first: { n: 0, right: 0, wrong: 0 } };
  const add = (a, b) => { a.n += b.n; a.right += b.right; a.wrong += b.wrong; };
  for (const src of SOURCES) {
    const raw = await fetchSource(src, dir);
    const { text, labels } = hideCategories(raw);
    const read = readStatement(text);
    const rows = scoredRows(read.rows);
    const out = read.rows.filter((r) => r.cents < 0).length;
    const scored = rows.filter((r) => r.cents < 0 && YNAB_MAP[labels[r.line - 1]]).length;
    console.log(`${src[0].padEnd(8)} ${src[1]}: ${read.rows.length} rows (${out} out), ${read.problems.length} problems, accounts ${read.accountNames?.length ?? 1}; scored ${scored}`);
    const kw = keywordsAlone(rows, labels, YNAB_MAP);
    const r = replay(rows, labels, { skip, map: YNAB_MAP });
    add(tot.kw, kw); add(tot.all, r.all); add(tot.first, r.first);
    console.log(`         keywords alone: ${fmt(kw)}`);
    console.log(`         learning loop, every line: ${fmt(r.all)}`);
    console.log(`         learning loop, first-seen payee: ${fmt(r.first)}`);
    console.log(`         by layer: ${Object.entries(r.byLayer).map(([k, v]) => `${k} ${v.right}/${v.n}`).join(", ")}`);
    if (nMiss) {
      const tally = {};
      for (const m of r.misses.filter((m) => m.first)) tally[m.line] = (tally[m.line] ?? 0) + 1;
      for (const [l, n] of Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, nMiss)) console.log(`           ${n}x ${l}`);
    }
  }
  console.log(`all three: keywords alone ${fmt(tot.kw)}; loop ${fmt(tot.all)}; first-seen ${fmt(tot.first)}`);
}
