// Probe: build a small file in each bank layout described in bank2ynab's
// bank2ynab.conf (MIT, https://github.com/bank2ynab/bank2ynab) and read it with
// readStatement. Only layouts with "Header Rows = 0" are tried: for those the
// config's Input Columns, delimiter and date format are the whole story, so the
// file is a real shape; a header row's wording is not in the config.
//   node eval/bank2ynab-probe.mjs path/to/bank2ynab.conf [--json]
import { readFileSync } from "node:fs";
import { readStatement } from "../bank.mjs";

const conf = readFileSync(process.argv[2], "utf8").split(/\r?\n/);
const sections = []; let cur = null;
for (const line of conf) {
  const m = line.match(/^\[(.+)\]\s*$/);
  if (m) { cur = { name: m[1], kv: {}, comments: [] }; sections.push(cur); continue; }
  if (!cur) continue;
  if (/^\s*#/.test(line)) { cur.comments.push(line.replace(/^\s*#\s*/, "")); continue; }
  const kv = line.match(/^([^=]+?)\s*=\s*(.*)$/);
  if (kv) cur.kv[kv[1].trim()] = kv[2].trim();
}
const dflt = sections.shift().kv;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const p2 = (n) => String(n).padStart(2, "0");
function fmtDate(fmt, d) {
  return fmt.replace(/%([YymdbBHMSe])/g, (_, c) => ({ Y: d.y, y: p2(d.y % 100), m: p2(d.m), d: p2(d.d), e: d.d, b: MON[d.m - 1], B: FULL[d.m - 1], H: "00", M: "00", S: "00" })[c]);
}
// four lines: signed cents, memo, date
const TX = [[-450, "COFFEE SHOP 4411", { y: 2026, m: 3, d: 13 }], [120000, "PAYROLL ACME LTD", { y: 2026, m: 3, d: 14 }], [-95000, "RENT MARCH", { y: 2026, m: 3, d: 15 }], [2000, "REFUND AMAZON", { y: 2026, m: 3, d: 16 }]];
const money = (c, comma) => { const s = (Math.abs(c) / 100).toFixed(2); return (c < 0 ? "-" : "") + (comma ? s.replace(".", ",") : s); };
const results = [];
for (const s of sections) {
  const kv = { ...dflt, ...s.kv };
  if (kv["Header Rows"] !== "0" || !kv["Date Format"] || !kv["Input Columns"].split(",").map((x) => x.trim()).includes("Date")) continue;
  const delim = kv["Source CSV Delimiter"] === "tab" ? "\t" : kv["Source CSV Delimiter"] || ",";
  const cols = kv["Input Columns"].split(",").map((x) => x.trim());
  let bal = 500000; const lines = [];
  const decComma = [";"].includes(delim) && /%d\.%m/.test(kv["Date Format"]);
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
    // two Inflow columns: ING puts the value in one of them
    if (cols.filter((x) => x === "Inflow").length === 2) { const idx = cols.map((x, i) => x === "Inflow" ? i : -1).filter((i) => i >= 0); cells[idx[1]] = ""; }
    lines.push(cells.map((x) => (x.includes(delim) ? `"${x}"` : x)).join(delim));
  }
  const text = lines.join("\n") + "\n";
  let r, err = null;
  try { r = readStatement(text); } catch (e) { err = String(e.message || e); }
  const want = TX.map((t) => t[0]);
  const got = r?.rows?.map((x) => x.cents) ?? [];
  const wantDates = TX.map((t) => `${t[2].y}-${p2(t[2].m)}-${p2(t[2].d)}`);
  const gotDates = r?.rows?.map((x) => x.date) ?? [];
  const hasAmount = cols.includes("Inflow") || cols.includes("Outflow");
  const flipped = !err && r.rows.length === 4 && got.every((c, i) => c === -want[i]) && r.problems.some((p) => /not labelled/.test(p));
  const ok = flipped || !err && r.rows.length === 4 && got.every((c, i) => c === want[i]) && gotDates.every((d, i) => d === wantDates[i]);
  results.push({ name: s.name, ok, flipped, hasAmount, cols: cols.join(","), delim, fmt: kv["Date Format"], got: got.join("|"), gotDates: gotDates.join("|"), problems: (r?.problems ?? []).slice(0, 2), err, sample: lines[0], skip: !hasAmount });
}
const tried = results.filter((r) => !r.skip);
const bad = tried.filter((r) => !r.ok);
if (process.argv.includes("--json")) console.log(JSON.stringify(results, null, 1));
else {
  console.log(`${tried.length} headerless layouts tried, ${tried.length - bad.length} read right (${tried.filter((r) => r.flipped).length} with signs flipped but flagged as unlabelled), ${bad.length} not`);
  for (const b of bad) console.log(`- ${b.name} [${b.cols}] delim=${JSON.stringify(b.delim)} fmt=${b.fmt}\n    ${JSON.stringify(b.sample)}\n    got ${b.got} / ${b.gotDates} ${b.err ?? b.problems.join(" ; ")}`);
}
