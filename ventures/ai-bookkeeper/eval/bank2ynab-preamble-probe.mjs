// Probe 2: bank2ynab.conf (MIT, github.com/bank2ynab/bank2ynab) gives, for every
// bank, the number of preamble rows (Header Rows), footer rows, delimiter, date
// format and column order of the real export, but not the header wording. Build a
// file per bank with that real skeleton: Header Rows-1 preamble lines of account
// summary text (made up, with the bank's delimiter, some blank, some with digits
// and dates), a header row using neutral wording for the config's column names,
// four made-up rows, then Footer Rows lines of totals text. Read with readStatement.
//   node eval/bank2ynab-preamble-probe.mjs path/to/bank2ynab.conf [--json]
import { readFileSync } from "node:fs";
import { readStatement } from "../bank.mjs";

const conf = readFileSync(process.argv[2], "utf8").split(/\r?\n/);
const sections = []; let cur = null;
for (const line of conf) {
  const m = line.match(/^\[(.+)\]\s*$/);
  if (m) { cur = { name: m[1], kv: {} }; sections.push(cur); continue; }
  if (!cur || /^\s*#/.test(line)) continue;
  const kv = line.match(/^([^=]+?)\s*=\s*(.*)$/);
  if (kv) cur.kv[kv[1].trim()] = kv[2].trim();
}
const dflt = sections.shift().kv;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const p2 = (n) => String(n).padStart(2, "0");
const fmtDate = (fmt, d) => fmt.replace(/%([YymdbBHMSe])/g, (_, c) => ({ Y: d.y, y: p2(d.y % 100), m: p2(d.m), d: p2(d.d), e: d.d, b: MON[d.m - 1], B: MON[d.m - 1], H: "00", M: "00", S: "00" })[c]);
const TX = [[-450, "COFFEE SHOP 4411", { y: 2026, m: 3, d: 13 }], [120000, "PAYROLL ACME LTD", { y: 2026, m: 3, d: 14 }], [-95000, "RENT MARCH", { y: 2026, m: 3, d: 15 }], [2000, "REFUND AMAZON", { y: 2026, m: 3, d: 16 }]];
const money = (c, comma) => { const s = (Math.abs(c) / 100).toFixed(2); return (c < 0 ? "-" : "") + (comma ? s.replace(".", ",") : s); };
const HEAD = { Date: "Date", Payee: "Description", Memo: "Memo", Outflow: "Debit", Inflow: "Credit", "Running Balance": "Balance", CDFlag: "D/C" };
const PRE = ["Account statement", "Account number: 12-3456-789", "Period: 01.03.2026 - 31.03.2026", "Opening balance: 5000.00", "", "Customer: EXAMPLE LTD", "Currency: EUR", "Exported on 01.04.2026", "", "Note: amounts in account currency", "Booked items only", "Page 1 of 1", "Statement no. 3/2026"];
const out = [];
for (const s of sections) {
  const kv = { ...dflt, ...s.kv };
  const hr = Number(kv["Header Rows"]), fr = Number(kv["Footer Rows"] || 0);
  const cols = kv["Input Columns"].split(",").map((x) => x.trim());
  // outflow-only layouts (income rows would be blank) and formats without a year cannot be built from the config
  if (!cols.includes("Inflow") || !/%[Yy]/.test(kv["Date Format"])) continue;
  if ((hr < 1 && !fr) || !kv["Date Format"] || !cols.includes("Date") || !(cols.includes("Inflow") || cols.includes("Outflow"))) continue;
  if (hr === 0 && fr === 0) continue;
  const delim = /^(tab|\\t)$/.test(kv["Source CSV Delimiter"]) ? "\t" : kv["Source CSV Delimiter"] || ",";
  const decComma = delim === ";" && /%d\.%m/.test(kv["Date Format"]);
  const q = (x) => (x.includes(delim) ? `"${x}"` : x);
  const lines = [];
  if (hr >= 1) {
    for (let i = 0; i < hr - 1; i++) lines.push(PRE[i % PRE.length].replace(/,/g, "") );
    const one = !cols.includes("Outflow"); // a lone Inflow column is a signed Amount in bank2ynab
    lines.push(cols.map((n, i) => (n === "Inflow" && one ? "Amount" : n === "skip" ? `Field${i + 1}` : HEAD[n] ?? n)).join(delim));
  }
  let bal = 500000;
  for (const [c, memo, d] of TX) {
    bal += c;
    const cells = cols.map((n) => {
      if (n === "Date") return fmtDate(kv["Date Format"], d);
      if (n === "CDFlag") return c < 0 ? "D" : "C";
      if (n === "Payee" || n === "Memo") return memo;
      if (n === "Inflow") return cols.includes("CDFlag") ? money(Math.abs(c), decComma) : cols.includes("Outflow") ? (c > 0 ? money(c, decComma) : "") : money(c, decComma);
      if (n === "Outflow") return c < 0 ? money(-c, decComma) : "";
      if (n === "Running Balance") return money(bal, decComma);
      return "";
    });
    if (cols.filter((x) => x === "Inflow").length === 2) { const idx = cols.map((x, i) => x === "Inflow" ? i : -1).filter((i) => i >= 0); cells[idx[1]] = ""; }
    lines.push(cells.map(q).join(delim));
  }
  const FOOT = ["", "Total debits;1,000.00", "Total credits;2,000.00", "Closing balance;5000.00"];
  for (let i = 0; i < fr; i++) lines.push(FOOT[(i + 1) % FOOT.length].replace(";", delim));
  const text = lines.join("\n") + "\n";
  let r, err = null;
  try { r = readStatement(text); } catch (e) { err = String(e.message || e); }
  const want = TX.map((t) => t[0]);
  const got = r?.rows?.map((x) => x.cents) ?? [];
  const ok = !err && got.length === 4 && got.every((c, i) => c === want[i]);
  out.push({ name: s.name, ok, hr, fr, delim, fmt: kv["Date Format"], got: got.join("|"), problems: (r?.problems ?? []).slice(0, 2), err, sample: lines.slice(0, hr + 1).join(" // ") });
}
const bad = out.filter((r) => !r.ok);
if (process.argv.includes("--json")) console.log(JSON.stringify(out, null, 1));
else {
  console.log(`${out.length} layouts with preamble or footer rows tried, ${out.length - bad.length} read right, ${bad.length} not`);
  for (const b of bad) console.log(`- ${b.name} hr=${b.hr} fr=${b.fr} delim=${JSON.stringify(b.delim)} fmt=${b.fmt}\n    ${b.sample.slice(0, 200)}\n    got ${b.got} ${b.err ?? b.problems.join(" ; ")}`);
}
