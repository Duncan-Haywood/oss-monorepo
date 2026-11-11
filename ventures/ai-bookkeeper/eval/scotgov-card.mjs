// The card network's merchant category, measured on real purchasing-card books.
//
// The Scottish Government publishes every payment-card line over £500 each month,
// with the merchant's name, the card network's merchant category name and the
// expense description its own staff filed it under. Open Data Scotland scrapes the
// reports into one JSON file a month (MIT-licensed repository; the underlying
// data is gov.scot's, under the Open Government Licence). Fetched at run time,
// nothing is copied here:
//
//   git clone --depth 1 https://github.com/OpenDataScotland/govspend.opendata.scot
//   node eval/scotgov-card.mjs --dir govspend.opendata.scot/_data/spendsOver500 [--from 2020-01] [--to 2025-12]
//        [--skip mcc|mcc-memory] [--mcc-before] [--plurality] [--misses 20] [--names 30]
//
// The run of 2026-11-11 read commit 33ab7a7 (2016-05 to 2026-08, 13,998 lines).
//
// Each line is replayed in date order, a day at a time, the way the import loop
// files lines: suggested from every earlier filed line, then filed with the staff's
// own answer. Only expense descriptions that name a chart account (EXPENSE_MAP,
// written before the first reading) are scored; "Not specified", "External support
// services", resettlement housing and the like are left out. The merchant's name
// is the description, the category name rides in txn.mcc.
//
// --skip mcc switches the new layer off for the comparison; --skip mcc-memory keeps only the
// fixed table; --mcc-before tries the layer ahead of the classifier and the keywords. --names prints the
// category names the layer reads as nothing, by count (its coverage).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { suggest, trainClassifier, buildMemory, buildMccMemory, trainNewPayee, historyRecord, payeeKey, MCC_MEMORY } from "../categorize.mjs";
import { mccAccount, normaliseMccName } from "../mcc.mjs";

// Staff expense description (lower case) -> chart accounts a careful bookkeeper could accept.
// Equipment may be expensed as supplies or capitalised, so both are accepted.
export const EXPENSE_MAP = [
  [/^(external training course|training)\b/, ["6170"]],
  [/^professional (subscription|membership)\b/, ["6170"]],
  [/^external (event|conference) - fees$|^external conference\b/, ["6170", "6120"]],
  [/\b(room|venue) hire\b/, ["6080"]],
  [/^(external event - )?accomm?odation\b|^accomm?odation - fees$/, ["6120"]],
  [/\bcatering\b/, ["6130"]],
  [/^vehicle - maintenance$/, ["6160", "6090"]],
  [/^vehicle hire$|^travel costs - car hire$/, ["6120", "6160"]],
  [/^stationery$/, ["6070"]],
  [/^office equipment$/, ["6070", "1500"]],
  [/^it (consumables|peripherals|hardware - accessories)$/, ["6070", "6100"]],
  [/^specialist softwares?( - renewal)?$/, ["6060"]],
  [/^postal services$/, ["6180", "6070"]],
  [/^advertising costs$/, ["6000"]],
  [/^external consultancy - fees$/, ["6050"]],
  [/\b(equipment|spares)\b.*\b(repair|maintenance)$/, ["6090", "6100"]],
  [/^(specialist laboratory|scientific|vessel( engineering| safety| scientific)?|farm|scientific farm|health & safety|photographic|inspection|specialist) equipment$|^(specialist )?protective clothing$|^personal protective equipment$|^vessel engineering spares$|^vessel safety equipment - clothing$/, ["6100", "1500"]],
];

export function wantFor(label) {
  const parts = String(label ?? "").toLowerCase().replace(/\s+/g, " ").trim().split(/ or /);
  const acc = new Set();
  for (const p of parts) {
    const hit = EXPENSE_MAP.find(([re]) => re.test(p.trim()));
    if (!hit) return null; // every alternative must name an account
    hit[1].forEach((a) => acc.add(a));
  }
  return acc.size ? [...acc] : null;
}

const dmy = (s) => { const [d, m, y] = String(s).split("/"); return y && m && d ? `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` : ""; };

export function loadDir(dir, { from = "", to = "9999" } = {}) {
  const rows = [];
  for (const f of readdirSync(dir).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).sort()) {
    for (const r of JSON.parse(readFileSync(join(dir, f), "utf8"))) {
      const want = wantFor(r["Expense Description"]);
      const amount = Number(r["Transaction Amount"]);
      const date = dmy(r["Transaction Date"]);
      const mcc = String(r["Merchant Category Name"] ?? "").trim();
      if (!want || !Number.isFinite(amount) || amount <= 0 || !date) continue;
      if (date.slice(0, 7) < from || date.slice(0, 7) > to) continue;
      rows.push({ desc: String(r["Merchant Name"] ?? "").trim(), date, cents: -Math.round(amount * 100), mcc: /not specified/i.test(mcc) ? "" : mcc, want });
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

const blank = () => ({ n: 0, right: 0, wrong: 0, blank: 0 });
const tally = (o, s, want) => { o.n++; if (!s.account) o.blank++; else if (want.includes(s.account)) o.right++; else o.wrong++; };

// rows: from loadDir (all years, so the model has the history); score only lines dated in [scoreFrom, scoreTo].
export function replay(rows, { skip = new Set(), scoreFrom = "", scoreTo = "9999" } = {}) {
  const hist = [], seen = new Set();
  const out = { all: blank(), first: blank(), repeat: blank(), firstBySource: {}, alone: blank(), misses: [] };
  let model = { rules: [], codes: null, memory: buildMemory([]), classifier: { n: 0 }, skip };
  let day = null, pending = [];
  for (const r of rows) {
    if (r.date !== day) {
      if (pending.length) { hist.push(...pending); pending = []; model = { rules: [], codes: null, memory: buildMemory(hist), classifier: trainClassifier(hist), newPayee: trainNewPayee(hist), mccMemory: buildMccMemory(hist), skip }; }
      day = r.date;
    }
    const txn = { desc: r.desc, cents: r.cents, ...(r.mcc ? { mcc: r.mcc } : {}) };
    const k = `${payeeKey(r.desc)}|out`, isFirst = !seen.has(k);
    seen.add(k);
    const m = r.date.slice(0, 7);
    if (m >= scoreFrom && m <= scoreTo) {
      const s = suggest(txn, model);
      tally(out.all, s, r.want);
      tally(isFirst ? out.first : out.repeat, s, r.want);
      // The layer on its own: what the category name says, whatever else is known.
      const a = mccAccount(r.mcc);
      tally(out.alone, { account: a?.account ?? null }, r.want);
      if (isFirst) {
        const b = (out.firstBySource[s.source] ??= blank()); tally(b, s, r.want);
        if (s.source === "mcc" && !r.want.includes(s.account)) out.misses.push(`${r.want.join("/")} got ${s.account} | ${r.mcc.slice(0, 50)} | ${r.desc.slice(0, 30)}`);
      }
    }
    pending.push(historyRecord(txn, r.want[0]));
  }
  return out;
}

const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + "%" : "-");
export const fmt = (o) => `n=${o.n} right ${pct(o.right, o.n)} wrong ${pct(o.wrong, o.n)} blank ${pct(o.blank, o.n)} (right of suggested ${pct(o.right, o.right + o.wrong)})`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i === -1 ? d : process.argv[i + 1]; };
  if (process.argv.includes("--mcc-before")) MCC_MEMORY.before = true;
  // --plurality: the split-category guess (off by default; README "Split categories").
  if (process.argv.includes("--plurality")) MCC_MEMORY.plurality = true;
  const rows = loadDir(arg("--dir"));
  const scoreFrom = arg("--from", ""), scoreTo = arg("--to", "9999");
  const skip = new Set((arg("--skip") ?? "").split(",").filter(Boolean));
  const o = replay(rows, { skip, scoreFrom, scoreTo });
  console.log(`${rows.length} mapped lines; scored ${scoreFrom || "start"} to ${scoreTo === "9999" ? "end" : scoreTo}${skip.size ? `, off: ${[...skip].join(",")}` : ""}`);
  console.log(`  all          ${fmt(o.all)}`);
  console.log(`  first seen   ${fmt(o.first)}`);
  console.log(`  seen before  ${fmt(o.repeat)}`);
  console.log(`  category name alone, every line ${fmt(o.alone)}`);
  console.log(`  first seen by source: ${Object.entries(o.firstBySource).map(([k, v]) => `${k} ${v.n} (${pct(v.right, v.n)} right)`).join(", ")}`);
  if (+arg("--misses", 0)) o.misses.slice(0, +arg("--misses")).forEach((m) => console.log(`    ${m}`));
  if (+arg("--names", 0)) {
    const c = new Map();
    for (const r of rows) if (r.mcc && !mccAccount(r.mcc) && r.date.slice(0, 7) >= scoreFrom && r.date.slice(0, 7) <= scoreTo) { const k = normaliseMccName(r.mcc); c.set(k, (c.get(k) ?? 0) + 1); }
    [...c].sort((a, b) => b[1] - a[1]).slice(0, +arg("--names")).forEach(([k, n]) => console.log(`    x${n} ${k}`));
  }
}
