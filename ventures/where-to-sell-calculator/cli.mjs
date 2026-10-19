#!/usr/bin/env node
// Which channel for each item in a spreadsheet, in a terminal.
//
//   node cli.mjs items.csv                      # best channel per item, and what routing them is worth
//   node cli.mjs items.csv --channels ebay,poshmark,mercari
//   node cli.mjs items.csv --csv > routed.csv   # one row per item and channel
//   node cli.mjs items.csv --json
//   node cli.mjs --example
//
// Same arithmetic as the web page (calc.mjs, the same channel presets): every
// item goes through every channel that is switched on. Zero dependencies, no
// network: prices and costs never leave the machine. Illustrative fee
// assumptions, not advice; replace the rates with your own before relying on it.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { CHANNEL_PRESETS, compareChannels } from "./calc.mjs";

const USAGE = `Rank every selling channel for each item in a CSV and show what routing items to their best channel is worth.

Usage:
  node cli.mjs [options] <items.csv | ->

Input: a header row, then one item per line. Columns (any order, case-insensitive):
  item (or name, title, sku)   a label for the row (optional)
  price                        what you would list it for (required)
  itemCost (or cost)           what the item cost you (required)
  shippingCharged              postage the buyer pays you (default 0)
  shippingCost                 postage you pay (default 0)
  packagingCost, otherCost     per-order extras (default 0)

Options:
  --channels <ids>       compare exactly these channels, e.g. ebay,etsy,poshmark
  --also <ids>           add channels that are off by default (e.g. poshmark,stockx), or local
                         (a fee-free direct sale, left out because it would win every item)
  --monthly-orders <n>   orders a month, to spread monthly plans over (default 100)
  --rank-by <profit|profitPerDay>   what "best" means (default profit)
  --no-returns           rank on the sold-sale profit, ignoring each channel's return rate
  --list-channels        print the channel ids and whether each is on by default
  --csv                  one row per item and channel
  --json                 the full result as JSON
  --example              run on built-in invented items
  -h, --help             this message

Fees and return rates are illustrative presets, the same as the web page's. The tool does
not know your account's rates, so edit calc.mjs or use the page to change one. Not financial advice.
`;

const ALIASES = {
  item: "label", name: "label", title: "label", sku: "label", label: "label",
  price: "price", cost: "itemCost", itemcost: "itemCost",
  shippingcharged: "shippingCharged", shippingcost: "shippingCost",
  packagingcost: "packagingCost", othercost: "otherCost",
};
const NUMERIC = ["price", "itemCost", "shippingCharged", "shippingCost", "packagingCost", "otherCost"];

export function sampleItems() {
  return [
    "item,price,itemCost,shippingCharged,shippingCost,packagingCost",
    "Vintage denim jacket,48,14,0,0,0.5",
    "Handmade ceramic mug,32,9,5,5.2,1.5",
    "Used paperback bundle,22,4,4,4.1,0.8",
    "Retro handheld console,95,40,8,7.5,2",
    "Phone case (new),12,3,3.5,3.2,0.4",
  ].join("\n") + "\n";
}

function splitLine(line) {
  const cells = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === "," || ch === "\t") { cells.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

export function parseItems(text) {
  const lines = String(text).replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return { error: "Give a header row and at least one item." };
  const header = splitLine(lines[0]).map((h) => ALIASES[h.toLowerCase().replace(/[\s_-]/g, "")] ?? null);
  if (!header.includes("price") || !header.includes("itemCost")) {
    return { error: "The header needs at least a price column and an itemCost (or cost) column." };
  }
  const rows = [], warnings = [];
  lines.slice(1).forEach((line, index) => {
    const cells = splitLine(line);
    const row = { label: `Item ${index + 1}` };
    for (let c = 0; c < header.length; c++) {
      const key = header[c], raw = cells[c] ?? "";
      if (!key || raw === "") continue;
      if (key === "label") { row.label = raw; continue; }
      const n = Number(raw.replace(/^\$/, ""));
      if (!Number.isFinite(n) || n < 0) { row.bad = `${key} "${raw}" is not a non-negative number`; break; }
      row[key] = n;
    }
    if (!row.bad && row.price === undefined) row.bad = "no price";
    if (!row.bad && row.itemCost === undefined) row.bad = "no itemCost";
    if (row.bad) warnings.push(`Skipped "${row.label}": ${row.bad}.`);
    else rows.push(row);
  });
  if (rows.length === 0) return { error: `No usable items. ${warnings.join(" ")}`.trim() };
  return { rows, warnings };
}

export function parseArgs(argv) {
  const o = { file: null, channels: null, also: [], monthlyOrders: 100, rankBy: "profit", returns: true,
    csv: false, json: false, example: false, help: false, list: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") o.help = true;
    else if (a === "--csv") o.csv = true;
    else if (a === "--json") o.json = true;
    else if (a === "--example") o.example = true;
    else if (a === "--list-channels") o.list = true;
    else if (a === "--no-returns") o.returns = false;
    else if (["--channels", "--also", "--monthly-orders", "--rank-by"].includes(a)) {
      const v = argv[++i];
      if (v === undefined) return { error: `${a} needs a value.` };
      if (a === "--channels") o.channels = v.split(",").map((s) => s.trim()).filter(Boolean);
      else if (a === "--also") o.also = v.split(",").map((s) => s.trim()).filter(Boolean);
      else if (a === "--rank-by") {
        if (v !== "profit" && v !== "profitPerDay") return { error: "--rank-by is profit or profitPerDay." };
        o.rankBy = v;
      } else {
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0) return { error: "--monthly-orders must be a positive number." };
        o.monthlyOrders = n;
      }
    } else if (a === "-" || !a.startsWith("-")) {
      if (o.file) return { error: "Give one items file." };
      o.file = a;
    } else return { error: `Unknown option ${a}. Try --help.` };
  }
  return o;
}

function pickChannels(a) {
  const ids = new Set(CHANNEL_PRESETS.map((p) => p.id));
  for (const id of [...(a.channels ?? []), ...a.also]) {
    if (!ids.has(id)) return { error: `Unknown channel "${id}". Try --list-channels.` };
  }
  const want = a.channels ? new Set(a.channels) : new Set(CHANNEL_PRESETS.filter((p) => p.enabled !== false && p.id !== "local").map((p) => p.id));
  for (const id of a.also) want.add(id);
  const chosen = CHANNEL_PRESETS.filter((p) => want.has(p.id)).map((p) => ({ ...p, enabled: true }));
  if (chosen.length === 0) return { error: "Choose at least one channel." };
  // "other" is a blank row for the page; with no rates it would win every item.
  if (chosen.some((c) => c.id === "other")) return { error: "The blank 'other' channel has no rates; use the web page to fill it in." };
  return { channels: chosen };
}

const r2 = (n) => Math.round(n * 100) / 100;
export const money = (n) => `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;

export function analyze(items, channels, opts = {}) {
  const includeReturns = opts.includeReturns !== false;
  const keep = (r) => (includeReturns ? r.expectedProfit : r.profit);
  const rows = [], errors = [];
  const totals = Object.fromEntries(channels.map((c) => [c.id, { label: c.label, keep: 0, items: 0 }]));
  let routed = 0;
  const wins = {};
  for (const item of items) {
    const { label, ...rest } = item;
    let cmp;
    try {
      cmp = compareChannels(channels, { monthlyOrders: opts.monthlyOrders ?? 100, rankBy: opts.rankBy ?? "profit", includeReturns, ...rest });
    } catch (e) {
      errors.push(`Skipped "${label}": ${e.message}`);
      continue;
    }
    const sorted = [...cmp.results].sort((x, y) => x.rank - y.rank);
    const best = sorted[0], next = sorted[1] ?? null;
    for (const r of cmp.results) { totals[r.id].keep += keep(r); totals[r.id].items += 1; }
    routed += keep(best);
    wins[best.id] = (wins[best.id] ?? 0) + 1;
    rows.push({
      label, best: best.id, bestLabel: best.label, keep: r2(keep(best)),
      runnerUp: next ? next.label : null, margin: next ? r2(keep(best) - keep(next)) : null,
      channels: sorted.map((r) => ({ id: r.id, label: r.label, rank: r.rank, profit: r2(r.profit), expectedProfit: r2(r.expectedProfit) })),
    });
  }
  const n = rows.length;
  const single = Object.entries(totals)
    .filter(([, t]) => t.items === n && n > 0)
    .map(([id, t]) => ({ id, label: t.label, keep: r2(t.keep) }))
    .sort((x, y) => y.keep - x.keep);
  return {
    rows, errors, includeReturns,
    routedKeep: r2(routed),
    bestSingleChannel: single[0] ?? null,
    uplift: single[0] ? r2(routed - single[0].keep) : null,
    singleChannel: single,
    wins: Object.entries(wins).map(([id, count]) => ({ id, label: totals[id].label, count })).sort((x, y) => y.count - x.count),
  };
}

export function render(r) {
  const out = [];
  const basis = r.includeReturns ? "expected keep after returns" : "profit on a completed sale";
  for (const row of r.rows) {
    const gap = row.margin === null ? "" : ` (${money(row.margin)} ahead of ${row.runnerUp})`;
    out.push(`${row.label}: ${row.bestLabel}, ${money(row.keep)}${gap}`);
  }
  out.push("");
  if (r.rows.length) {
    out.push(`Routing each of ${r.rows.length} item(s) to its best channel keeps ${money(r.routedKeep)} (${basis}, one unit each).`);
    if (r.bestSingleChannel) {
      out.push(`Listing everything on ${r.bestSingleChannel.label} alone, the best single channel, keeps ${money(r.bestSingleChannel.keep)}: routing adds ${money(r.uplift)}.`);
    }
    out.push(`Channels that won an item: ${r.wins.map((w) => `${w.label} ${w.count}`).join(", ")}.`);
    out.push("Fees and return rates are illustrative presets; use your own before acting on this.");
  }
  for (const e of r.errors) out.push(`Note: ${e}`);
  return out.join("\n") + "\n";
}

const cell = (v) => (/[",\n\r]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v));
export function reportCsv(r) {
  const lines = ["item,channel,rank,is_best,profit,expected_profit"];
  for (const row of r.rows) {
    for (const c of row.channels) {
      lines.push([row.label, c.label, c.rank, c.id === row.best ? "yes" : "", c.profit.toFixed(2), c.expectedProfit.toFixed(2)].map(cell).join(","));
    }
  }
  return lines.join("\n") + "\n";
}

export async function main(argv, io = { read: (f) => readFile(f, "utf8"), stdin: () => readFile(0, "utf8") }) {
  const a = parseArgs(argv);
  if (a.error) return { code: 2, err: a.error + "\n" };
  if (a.help) return { code: 0, out: USAGE };
  if (a.list) {
    return { code: 0, out: CHANNEL_PRESETS.map((p) => `${p.id.padEnd(22)} ${p.label}${p.enabled === false || p.id === "local" ? "  (off by default)" : ""}`).join("\n") + "\n" };
  }
  let text;
  if (a.example) text = sampleItems();
  else if (!a.file) return { code: 2, err: "Give an items file, '-' for stdin, or --example. Try --help.\n" };
  else try { text = a.file === "-" ? await io.stdin() : await io.read(a.file); } catch (e) { return { code: 2, err: `Cannot read ${a.file}: ${e.message}\n` }; }
  const parsed = parseItems(text);
  if (parsed.error) return { code: 2, err: parsed.error + "\n" };
  const picked = pickChannels(a);
  if (picked.error) return { code: 2, err: picked.error + "\n" };
  const r = analyze(parsed.rows, picked.channels, { monthlyOrders: a.monthlyOrders, rankBy: a.rankBy, includeReturns: a.returns });
  r.errors.unshift(...parsed.warnings);
  if (r.rows.length === 0) return { code: 2, err: `No item could be compared. ${r.errors.join(" ")}\n` };
  return { code: 0, out: a.json ? JSON.stringify(r, null, 2) + "\n" : a.csv ? reportCsv(r) : render(r) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const res = await main(process.argv.slice(2));
  if (res.out) process.stdout.write(res.out);
  if (res.err) process.stderr.write(res.err);
  process.exitCode = res.code;
}
