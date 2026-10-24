// Probe: build a small header-less file in each bank layout of the Firefly III
// Data Importer's community configurations (MIT, github.com/firefly-iii/
// import-configurations; one default.json per bank: delimiter, PHP date format
// and the role of every column) and read it with readStatement. The configs do
// not carry the bank's header wording, so the file has no header row, as in
// bank2ynab-probe.mjs; every layout is tried, whether or not the bank writes a
// header. Columns not needed to judge the read get filler.
//   node eval/firefly-probe.mjs DIR_OF_default.json_FILES [--json]
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readStatement } from "../bank.mjs";

const dir = process.argv[2];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const p2 = (n) => String(n).padStart(2, "0");
// PHP date() letters seen in the configs; "fr:" prefix is the importer's locale tag
function fmtDate(fmt, d) {
  return fmt.replace(/^[a-z]{2}:/, "").replace(/[YymdnjMHisv]/g, (c) => ({ Y: d.y, y: p2(d.y % 100), m: p2(d.m), d: p2(d.d), n: d.m, j: d.d, M: MON[d.m - 1], H: "00", i: "00", s: "00", v: "000" })[c]);
}
const TX = [[-450, "COFFEE SHOP 4411", { y: 2026, m: 3, d: 13 }], [120000, "PAYROLL ACME LTD", { y: 2026, m: 3, d: 14 }], [-95000, "RENT MARCH", { y: 2026, m: 3, d: 15 }], [2000, "REFUND AMAZON", { y: 2026, m: 3, d: 16 }]];
const money = (c, comma) => { const s = (Math.abs(c) / 100).toFixed(2); return comma ? s.replace(".", ",") : s; };
const results = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
  const cfg = JSON.parse(readFileSync(join(dir, f), "utf8"));
  const roles = cfg.roles ?? [];
  const delim = { comma: ",", semicolon: ";", tab: "\t" }[cfg.delimiter] ?? ",";
  const fmt = cfg.date ?? "";
  const hasDate = roles.includes("date_transaction") || roles.includes("date");
  const hasAmt = roles.some((r) => /^amount(_debit|_credit)?$/.test(r) || r === "debit_amount" || r === "credit_amount");
  if (!hasDate || !hasAmt || !fmt) continue;
  const decComma = delim === ";" || delim === "\t";
  const lines = [];
  for (const [c, memo, d] of TX) {
    let seenDesc = false, seenDate = false, seenAmt = false;
    const cells = roles.map((r) => {
      if (r === "date_transaction" || r === "date") { if (seenDate) return fmtDate(fmt, d); seenDate = true; return fmtDate(fmt, d); }
      if (r === "description" || r === "narration") { if (seenDesc) return ""; seenDesc = true; return memo; }
      if (r === "amount") { if (seenAmt) return ""; seenAmt = true; return (c < 0 ? "-" : "") + money(c, decComma); }
      if (r === "ing-debit-credit") return c < 0 ? "Af" : "Bij";
      if (r === "amount_debit" || r === "debit_amount") return c < 0 ? money(c, decComma) : "";
      if (r === "amount_credit" || r === "credit_amount") return c > 0 ? money(c, decComma) : "";
      if (r === "currency-code") return "EUR";
      if (r === "account-iban") return "NL91ABNA0417164300";
      return "";
    });
    lines.push(cells.map((x) => (x.includes(delim) ? `"${x}"` : x)).join(delim));
  }
  const text = lines.join("\n") + "\n";
  let r, err = null;
  try { r = readStatement(text); } catch (e) { err = String(e.message || e); }
  const want = TX.map((t) => t[0]);
  const got = r?.rows?.map((x) => x.cents) ?? [];
  const wantDates = TX.map((t) => `${t[2].y}-${p2(t[2].m)}-${p2(t[2].d)}`);
  const gotDates = r?.rows?.map((x) => x.date) ?? [];
  const flipped = !err && r.rows.length === 4 && got.every((c, i) => c === -want[i]) && r.problems.some((p) => /not labelled/.test(p));
  const ok = flipped || !err && r.rows.length === 4 && got.every((c, i) => c === want[i]) && gotDates.every((d, i) => d === wantDates[i]);
  results.push({ name: f.replace(/\.json$/, ""), ok, flipped, delim, fmt, got: got.join("|"), gotDates: gotDates.join("|"), problems: (r?.problems ?? []).slice(0, 2), err, sample: lines[0] });
}
const bad = results.filter((r) => !r.ok);
if (process.argv.includes("--json")) console.log(JSON.stringify(results, null, 1));
else {
  console.log(`${results.length} layouts tried, ${results.length - bad.length} read right (${results.filter((r) => r.flipped).length} with signs flipped but flagged as unlabelled), ${bad.length} not`);
  for (const b of bad) console.log(`- ${b.name} delim=${JSON.stringify(b.delim)} fmt=${b.fmt}\n    ${JSON.stringify(b.sample)}\n    got ${b.got} / ${b.gotDates} ${b.err ?? b.problems.join(" ; ")}`);
}
