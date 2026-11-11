// The card network's merchant category on a second buyer's purchasing-card books:
// the City of Toronto's monthly PCard expenditure report, which carries the
// merchant's name, the network's merchant category CODE ("Merchant Type", e.g.
// 5541) beside its name, and the G/L account the city filed each line to. The
// Scottish Government reading (eval/scotgov-card.mjs) had names only; this one
// reads the code, the case `mcc.mjs` was written for and had not been measured on.
//
// The data is the City of Toronto's (Open Government Licence - Toronto). One
// month, November 2017, is in a public repository; nothing is copied here:
//
//   git clone --depth 1 https://github.com/beauhomme/toronto_pcard
//   node eval/toronto-pcard.mjs --file "toronto_pcard/infiles/PCard Expenses_2017_11_Final.xlsx"
//        [--skip mcc|mcc-memory] [--field code|name|both] [--plurality] [--misses 20]
//
// The run of 2026-11-11 read commit 66321c9 of that repository (4,823 card lines
// dated 2017-10-17 to 2017-11-30, of which the map below names a chart account for
// 4,284 after dropping credits).
// The city's open-data portal has every month since 2009 but did not answer from
// the session that wrote this.
//
// Each line is replayed a day at a time from an empty set of books, the way the
// import loop files them (eval/scotgov-card.mjs `replay`). One month from empty is
// a cold start: most merchants are new, which is the case the category is for.
// Only G/L accounts that name a chart account (GL_MAP, written from the account
// names before the first reading) are scored; "miscellaneous materials", "other
// expenses", "contracted services - general", PCard recoveries and the five-star
// placeholder codes are left out.
import { readFileSync } from "node:fs";
import { parseCsv } from "../bank.mjs";
import { xlsxToCsv, looksLikeXlsx } from "../xlsx.mjs";
import { replay, fmt } from "./scotgov-card.mjs";
import { MCC_MEMORY } from "../categorize.mjs";
import { mccAccount, normaliseMccName } from "../mcc.mjs";

// City G/L account (4 digits) -> chart accounts a careful bookkeeper could accept.
// Supplies bought for repairs may be supplies or repairs; equipment may be
// expensed or capitalised; food bought for programmes may be meals or supplies.
const S = ["6100"], RS = ["6100", "6090"], EQ = ["6100", "1500"];
export const GL_MAP = {
  "2600": S, "2601": S, "3040": EQ,
  "2750": ["6130", "6100"], "2740": ["6130", "6100"], "2741": ["6130", "6100"], "4820": ["6130"], "4823": ["6130"],
  "2530": RS, "2531": RS, "2532": RS, "2535": RS, "2540": RS, "2575": RS, "2715": RS, "2730": RS, "2780": RS, "2786": RS, "2552": RS, "2710": RS,
  "2110": RS, "2120": RS, "2130": ["6100", "6090", "6160"], "2135": ["6160", "6090", "6100"],
  "4414": ["6000"], "4084": ["6000"], "4822": ["6000", "6130"], "2790": ["6000", "6100"], "2792": ["6000", "6100"], "4825": ["6000", "6070"],
  "4830": ["6110"], "4128": ["6110", "6050"],
  "4770": ["6160", "6120"], "4570": ["6160", "6120", "6080"],
  "2010": ["6070"], "2040": ["6070"], "2099": ["6070", "1500"], "3030": ["6070", "1500"],
  "3010": EQ, "3015": EQ, "3020": EQ, "3025": EQ, "3032": EQ, "3050": EQ, "3080": EQ, "3099": EQ, "4808": EQ,
  "3310": ["6070", "1500", "6100"], "3320": ["6100", "1500", "6090"],
  "4310": ["6170"], "4256": ["6170", "6120"], "4760": ["6170"], "2020": ["6170", "6060"],
  "2560": S, "2610": S, "2665": S, "2670": S, "2570": S, "2620": S, "2860": S, "2823": S, "2824": S, "2615": S, "2695": S, "2546": S, "2082": S, "2590": S, "2080": S, "2791": ["6100", "6000"],
  "4699": ["6090"], "4403": ["6090"], "4409": ["6090"], "4077": ["6090", "6160"], "4419": ["6090"], "4435": ["6090"], "4083": ["6160", "6090"],
  "2260": ["6160"], "2280": ["6160"], "2401": ["6160", "6100"], "2270": ["6160", "6140"], "2240": ["6140"],
  "3410": ["6070", "6100", "1500"], "3420": ["6060"], "4827": ["6060"],
  "4813": ["6140"], "4804": ["6140"], "4441": ["6140"],
  "4210": ["6120"], "4215": ["6120"], "4220": ["6120"], "4252": ["6120", "6170"], "4253": ["6120", "6170"], "4452": ["6120"],
  "4085": ["6050"], "4199": ["6050"], "4025": ["6050"], "4102": ["6020"], "4082": ["6000", "6020"],
  "2990": ["5000", "6100"],
  "4815": ["6180"], "4805": ["6070", "6180"], "4416": ["6180"],
  "4520": ["6080"], "4525": ["6080"], "4530": ["6080"], "4590": ["6080"], "4510": ["6080", "6160", "6120"],
};

// November 2025 onwards the report uses 7-digit accounts; toronto-gl-2025.json pairs
// each with the 4-digit account of the same description, read off the portal's rows.
export const NEW_GL = JSON.parse(readFileSync(new URL("./toronto-gl-2025.json", import.meta.url), "utf8")).pairs;
const glWant = (g) => GL_MAP[g] ?? GL_MAP[NEW_GL[g]];

export function loadToronto(csv, { field = "both", division = null } = {}) {
  const rows = parseCsv(csv);
  const h = rows[0].map((x) => String(x).trim());
  const col = (name) => h.indexOf(name);
  const c = { date: col("Transaction Date"), desc: col("Merchant Name"), amt: col("Transaction Amt."), gl: col("G/L Account"), code: col("Merchant Type"), name: col("Merchant Type Description"), div: col("Division") };
  const out = [];
  for (const r of rows.slice(1)) {
    // The portal's CSV prints "2025-07-02 00:00:00"; the 2017 workbook prints the date alone.
    const date = String(r[c.date] ?? "").trim().slice(0, 10), amount = Number(r[c.amt]), want = glWant(String(r[c.gl] ?? "").trim());
    // Rows with no date are the report's per-card subtotals.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !want || !Number.isFinite(amount) || amount <= 0) continue;
    const div = c.div === -1 ? "" : String(r[c.div] ?? "").trim();
    if (division && div !== division) continue;
    const code = String(r[c.code] ?? "").trim(), name = String(r[c.name] ?? "").trim();
    const mcc = field === "code" ? code : field === "name" ? name : [code, name].filter(Boolean).join(" ");
    out.push({ desc: String(r[c.desc] ?? "").trim(), date, cents: -Math.round(amount * 100), mcc, want, ...(div ? { division: div } : {}) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i === -1 ? d : process.argv[i + 1]; };
  const bytes = readFileSync(arg("--file"));
  const csv = looksLikeXlsx(bytes) ? await xlsxToCsv(new Uint8Array(bytes)) : bytes.toString("utf8");
  const field = arg("--field", "both");
  const rows = loadToronto(csv, { field, division: arg("--division") });
  // --plurality: the split-category guess (off by default; README "Split categories").
  if (process.argv.includes("--plurality")) MCC_MEMORY.plurality = true;
  const skip = new Set((arg("--skip") ?? "").split(",").filter(Boolean));
  const o = replay(rows, { skip });
  const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + "%" : "-");
  console.log(`${rows.length} mapped lines, ${rows[0]?.date} to ${rows.at(-1)?.date}; category field: ${field}${skip.size ? `; off: ${[...skip].join(",")}` : ""}`);
  console.log(`  all          ${fmt(o.all)}`);
  console.log(`  first seen   ${fmt(o.first)}`);
  console.log(`  seen before  ${fmt(o.repeat)}`);
  console.log(`  category alone, every line ${fmt(o.alone)}`);
  console.log(`  first seen by source: ${Object.entries(o.firstBySource).map(([k, v]) => `${k} ${v.n} (${pct(v.right, v.n)} right)`).join(", ")}`);
  if (+arg("--misses", 0)) o.misses.slice(0, +arg("--misses")).forEach((m) => console.log(`    ${m}`));
  if (+arg("--codes", 0)) {
    const cnt = new Map();
    for (const r of rows) if (r.mcc && !mccAccount(r.mcc)) { const k = r.mcc.slice(0, 50); cnt.set(k, (cnt.get(k) ?? 0) + 1); }
    [...cnt].sort((a, b) => b[1] - a[1]).slice(0, +arg("--codes")).forEach(([k, n]) => console.log(`    x${n} ${k}`));
  }
}
