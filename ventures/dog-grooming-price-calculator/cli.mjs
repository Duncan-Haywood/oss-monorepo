#!/usr/bin/env node
// Zero-dependency CLI: price dog grooming classes against a target hourly, or audit
// past appointments by breed class. No network call -- local files/stdin only.
//
//   node cli.mjs compare fixtures/classes.csv --target 60 --drive 20
//   node cli.mjs audit fixtures/appointments.csv --target 60 --drive 20 --json
//   cat appointments.csv | node cli.mjs audit -

import fs from "node:fs/promises";
import { parseClasses, compare, summarizeCompare, parseAppointments, audit, summarizeAudit, money, MODEL_NOTE } from "./engine.mjs";

const FLAGS = {
  "--target": "targetHourly", "--walkaway": "walkAwayPct", "--drive": "driveMinutes",
  "--no-show": "noShowPct", "--supplies": "suppliesPerDog",
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
  "  node cli.mjs compare <classes.csv|-> [--target 60] [--walkaway 75] [--drive 0] [--no-show 5] [--supplies 6] [--json]",
  "  node cli.mjs audit <appointments.csv|-> [--target 60] [--drive 0] [--no-show 5] [--supplies 6] [--json]",
  "",
  "Class rows: class,price,minutes[,supplies,matting_minutes,matting_fee,deshed_minutes,deshed_fee]",
  "Appointment rows: breed_class,price,minutes",
  `Up to 500 rows. ${MODEL_NOTE}`,
].join("\n");

export async function run(argv, io = { readFile: (f) => fs.readFile(f, "utf8") }) {
  const args = parseArgs(argv);
  const bad = (message) => ({ exitCode: 2, output: `${message}\n\n${USAGE}` });
  if (args.help) return { exitCode: 0, output: USAGE };
  if (args.unknown) return bad(`Unknown option ${args.unknown}`);
  if (args.sub !== "compare" && args.sub !== "audit") return bad("Expected the compare or audit command");
  const opts = {};
  for (const [flag, v] of Object.entries(args.opts)) {
    if (v === undefined || v === "") return bad(`${flag} needs a value`);
    opts[FLAGS[flag]] = v;
  }
  const file = args.positional[0];
  if (!file) return bad(args.sub === "compare" ? "Give a classes file, or - for stdin" : "Give an appointments file, or - for stdin");
  let text;
  try { text = file === "-" ? await readStdin() : await io.readFile(file); } catch (e) { return bad(`Cannot read ${file}: ${e.message}`); }
  if (args.sub === "compare") {
    const parsed = parseClasses(text, opts);
    if (parsed.errors.length) return bad(parsed.errors.join("\n"));
    if (!parsed.classes.length) return bad("No class rows found");
    let c;
    try { c = compare(parsed, opts); } catch (e) { return bad(e.message); }
    if (args.json) return { exitCode: 0, output: JSON.stringify(c, null, 2) };
    const lines = [summarizeCompare(c).text, "", "Class (worst first)           Price  Min  Effective/h  Price for target  Walk-away"];
    for (const r of c.classes) {
      const p = r.plain;
      lines.push(`${r.name.padEnd(26)} ${money(p.price).padStart(8)} ${String(p.minutes).padStart(4)} ${money(p.effective).padStart(12)} ${money(p.neededPrice).padStart(17)} ${money(p.walkAway).padStart(10)}`);
      for (const v of r.variants.slice(1)) lines.push(`    ${v.label.padEnd(22)} ${money(v.price).padStart(8)} ${String(v.minutes).padStart(4)} ${money(v.effective).padStart(12)} ${money(v.neededPrice).padStart(17)} ${money(v.walkAway).padStart(10)}`);
    }
    lines.push("", MODEL_NOTE);
    return { exitCode: 0, output: lines.join("\n") };
  }
  const parsed = parseAppointments(text);
  if (parsed.errors.length) return bad(parsed.errors.join("\n"));
  if (!parsed.appointments.length) return bad("No appointment rows found");
  let a;
  try { a = audit(parsed, opts); } catch (e) { return bad(e.message); }
  if (args.json) return { exitCode: 0, output: JSON.stringify(a, null, 2) };
  const lines = [summarizeAudit(a).text, "", "By breed class (worst first):"];
  a.classes.forEach((g, i) => lines.push(`  ${i + 1}. ${g.name}: ${g.count} dog${g.count === 1 ? "" : "s"}, avg ${money(g.avgPrice)} in ${g.avgMinutes.toFixed(0)} min = ${money(g.effective)}/h  ${g.atTarget ? "at target" : `raise ${money(g.raisePerDog)} a dog (to ${money(g.neededAvgPrice)})`}`));
  lines.push("", `Total ${money(a.revenue)}, ${a.hours.toFixed(1)} hours held, blended ${money(a.blendedHourly)}/h`, MODEL_NOTE);
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
