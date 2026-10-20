#!/usr/bin/env node
// Zero-dependency CLI: compare booth rent, commission and employee take-home per
// hour worked, or audit past weeks. No network call -- local files/stdin only.
//
//   node cli.mjs compare --clients 24 --ticket 60 --rent 275 --split 55 --wage 15
//   node cli.mjs history weeks.csv --target 25
//   cat weeks.csv | node cli.mjs history - --json

import fs from "node:fs/promises";
import { compare, summarizeCompare, parseWeeks, history, summarizeHistory, money, MODEL_NOTE } from "./engine.mjs";

const FLAGS = {
  "--hours": "hoursAtSalon", "--clients": "clientsPerWeek", "--ticket": "avgTicket", "--minutes": "minutesPerClient",
  "--unpaid-hours": "unpaidHours", "--tips": "tipPct", "--retail": "retailPerClient", "--supplies": "suppliesPerClient",
  "--target": "targetHourly", "--rent": "rentPerWeek", "--card-fee": "cardFeePct", "--retail-margin": "retailMarginPct",
  "--insurance": "insuranceMonthly", "--other-fixed": "otherFixedMonthly", "--booth-supplies": "boothSuppliesPct",
  "--split": "splitPct", "--retail-commission": "retailCommissionPct", "--commission-supplies": "commissionSuppliesPct",
  "--wage": "hourlyWage", "--employee-supplies": "employeeSuppliesPct", "--se-tax": "seTaxPct",
  "--income-reserve": "incomeReservePct", "--fica": "ficaPct",
};

function parseArgs(argv) {
  const args = { json: false, positional: [], opts: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (FLAGS[a]) args.opts[a] = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else if (a.startsWith("-") && a !== "-") args.unknown = a;
    else args.positional.push(a);
  }
  return args;
}

const USAGE = [
  "Usage:",
  "  node cli.mjs compare [--hours 36] [--clients 24] [--ticket 60] [--minutes 75] [--unpaid-hours 4] [--tips 18]",
  "                       [--retail 5] [--supplies 6.5] [--target 25]",
  "                       booth:      --rent 275 --card-fee 2.9 --retail-margin 40 --insurance 40 --other-fixed 35 --booth-supplies 100",
  "                       commission: --split 55 --retail-commission 10 --commission-supplies 20",
  "                       employee:   --wage 15 --employee-supplies 0",
  "                       tax:        --se-tax 15.3 --income-reserve 10 --fica 7.65   [--json]",
  "  node cli.mjs history <weeks.csv|-> [--target 25] [--se-tax 15.3] [--income-reserve 10] [--json]",
  "",
  "Week rows: week,model,pay,tips,expenses,hours[,booked_hours]   (model is booth, commission or employee)",
  `Up to 300 weeks. ${MODEL_NOTE}`,
].join("\n");

export async function run(argv, io = { readFile: (f) => fs.readFile(f, "utf8") }) {
  const args = parseArgs(argv);
  const bad = (message) => ({ exitCode: 2, output: `${message}\n\n${USAGE}` });
  if (args.help) return { exitCode: 0, output: USAGE };
  if (args.unknown) return bad(`Unknown option ${args.unknown}`);
  if (args.sub !== "compare" && args.sub !== "history") return bad("Expected the compare or history command");
  const opts = {};
  for (const [flag, v] of Object.entries(args.opts)) {
    if (v === undefined || v === "") return bad(`${flag} needs a value`);
    opts[FLAGS[flag]] = v;
  }
  if (args.sub === "compare") {
    let c;
    try { c = compare(opts); } catch (e) { return bad(e.message); }
    if (args.json) return { exitCode: 0, output: JSON.stringify(c, null, 2) };
    const lines = [summarizeCompare(c).text, "", "Arrangement                 Take-home/wk  Hours worked  Per hour worked  Per hour booked  Break-even clients/wk"];
    for (const m of c.models) {
      const be = m.breakEvenClients === null ? "not within 150" : m.breakEvenClients.toFixed(1);
      lines.push(`${m.label.padEnd(27)} ${money(m.takeHome).padStart(12)} ${m.hoursWorked.toFixed(1).padStart(13)} ${money(m.perWorkedHour).padStart(16)} ${money(m.perBookedHour).padStart(16)}  ${be}`);
    }
    lines.push("", "Weekly detail (before tax set-asides):");
    for (const m of c.models) {
      lines.push(`  ${m.label}: ${m.lines.map(([k, v]) => `${k} ${money(v)}`).join(", ")}; net ${money(m.net)}, ${m.seLabel} ${money(m.seTax)}, income reserve ${money(m.incomeReserve)}`);
    }
    const x = c.crossovers;
    lines.push("", `Booth overtakes commission at ${x.boothVsCommission === null ? "no client count up to 150" : `${x.boothVsCommission.toFixed(1)} clients a week`}; overtakes employee at ${x.boothVsEmployee === null ? "no client count up to 150" : `${x.boothVsEmployee.toFixed(1)} clients a week`}.`);
    lines.push("", MODEL_NOTE);
    return { exitCode: 0, output: lines.join("\n") };
  }
  const file = args.positional[0];
  if (!file) return bad("Give a weeks file, or - for stdin");
  let text;
  try { text = file === "-" ? await readStdin() : await io.readFile(file); } catch (e) { return bad(`Cannot read ${file}: ${e.message}`); }
  const parsed = parseWeeks(text);
  if (parsed.errors.length) return bad(parsed.errors.join("\n"));
  if (!parsed.weeks.length) return bad("No week rows found");
  let h;
  try { h = history(parsed, opts); } catch (e) { return bad(e.message); }
  if (args.json) return { exitCode: 0, output: JSON.stringify(h, null, 2) };
  const lines = [summarizeHistory(h).text, "", "By arrangement (best first):"];
  for (const g of h.byModel) lines.push(`  ${g.model}: ${g.count} week${g.count === 1 ? "" : "s"}, ${money(g.takeHome)} take-home for ${g.hours} h = ${money(g.perWorkedHour)}/h${g.idleShare === null ? "" : `, ${(g.idleShare * 100).toFixed(0)}% of hours idle`}`);
  lines.push("", "Worst take-home per hour worked first:");
  h.weeks.forEach((w, i) => lines.push(`  ${i + 1}. ${w.name} (${w.model})  ${money(w.takeHome)} for ${w.hours} h = ${money(w.perWorkedHour)}/h  ${w.atTarget ? "at target" : `short ${money(w.shortfall)}`}`));
  lines.push("", `Total ${money(h.takeHome)} take-home, ${h.hours} hours, blended ${money(h.blendedHourly)}/h`, MODEL_NOTE);
  return { exitCode: 0, output: lines.join("\n") };
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  run(process.argv.slice(2)).then(({ exitCode, output }) => {
    (exitCode ? console.error : console.log)(output);
    process.exitCode = exitCode;
  });
}
