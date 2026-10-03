#!/usr/bin/env node
// Zero-dependency CLI: compare interior design fee models on one project, or
// audit past projects by effective hourly. No network call -- local files/stdin only.
//
//   node cli.mjs compare --design-hours 50 --project-cost 60000 --overrun 40
//   node cli.mjs history projects.csv --target 110
//   cat projects.csv | node cli.mjs history - --json

import fs from "node:fs/promises";
import { compare, summarizeCompare, parseProjects, history, summarizeHistory, money, MODEL_NOTE } from "./engine.mjs";

const FLAGS = {
  "--design-hours": "designHours", "--site-visits": "siteVisits", "--visit-hours": "visitHours",
  "--items": "procurementItems", "--minutes-per-item": "minutesPerItem", "--meetings": "meetings",
  "--meeting-hours": "meetingHours", "--overrun": "overrunPct", "--stress-overrun": "stressOverrunPct",
  "--target": "targetHourly", "--walkaway": "walkAwayPct", "--project-cost": "projectCost",
  "--product-spend": "productSpend", "--sqft": "sqft", "--hourly": "hourlyRate", "--write-off": "writeOffPct",
  "--flat": "flatFee", "--percent": "percentRate", "--per-sqft": "sqftRate", "--margin": "marginPct",
  "--hybrid-flat": "hybridFlat", "--hybrid-margin": "hybridMarginPct",
};
const RATE_KEYS = new Set(["hourlyRate", "flatFee", "percentRate", "sqftRate", "marginPct", "hybridFlat", "hybridMarginPct"]);

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
  "  node cli.mjs compare [--design-hours 40] [--site-visits 4] [--visit-hours 2.5] [--items 60] [--minutes-per-item 25]",
  "                       [--meetings 6] [--meeting-hours 1] [--overrun 25] [--stress-overrun 50] [--target 100] [--walkaway 75]",
  "                       [--project-cost 40000] [--product-spend 30000] [--sqft 1500] [--json]",
  "                       model rates: --hourly 125 --write-off 10 --flat 8500 --percent 20 --per-sqft 6 --margin 25",
  "                                    --hybrid-flat 3500 --hybrid-margin 18   (pass `none` to drop a model)",
  "  node cli.mjs history <projects.csv|-> [--target 100] [--json]",
  "",
  "Project rows: project,model,fee,hours   (model is any label, for example hourly, flat, percent, sqft, margin, hybrid)",
  `Up to 300 projects. ${MODEL_NOTE}`,
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
    opts[FLAGS[flag]] = RATE_KEYS.has(FLAGS[flag]) && v.toLowerCase() === "none" ? null : v;
  }
  if (args.sub === "compare") {
    let c;
    try { c = compare(opts); } catch (e) { return bad(e.message); }
    if (args.json) return { exitCode: 0, output: JSON.stringify(c, null, 2) };
    const lines = [summarizeCompare(c).text, "", `Baseline ${c.baseline.toFixed(1)} h: ${Object.entries(c.parts).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(", ")}`];
    lines.push(`Fee needed for target: ${money(c.minimumFee)}   Walk-away: ${money(c.walkAway)}`, "", "Model                              Fee        Effective/h  At stress/h  Break-even overrun");
    for (const m of c.models) {
      const be = m.breakEvenOverrunPct === null ? "n/a (billed hourly)" : m.breakEvenOverrunPct < 0 ? "below target at baseline" : `${m.breakEvenOverrunPct.toFixed(1)}%`;
      lines.push(`${m.label.padEnd(34)} ${money(m.fee).padStart(10)} ${money(m.effective).padStart(12)} ${money(m.stressEffective).padStart(12)}  ${be}`);
    }
    lines.push("", MODEL_NOTE);
    return { exitCode: 0, output: lines.join("\n") };
  }
  const file = args.positional[0];
  if (!file) return bad("Give a projects file, or - for stdin");
  let text;
  try { text = file === "-" ? await readStdin() : await io.readFile(file); } catch (e) { return bad(`Cannot read ${file}: ${e.message}`); }
  const parsed = parseProjects(text);
  if (parsed.errors.length) return bad(parsed.errors.join("\n"));
  if (!parsed.projects.length) return bad("No project rows found");
  let h;
  try { h = history(parsed, opts); } catch (e) { return bad(e.message); }
  if (args.json) return { exitCode: 0, output: JSON.stringify(h, null, 2) };
  const lines = [summarizeHistory(h).text, "", "By fee model (best first):"];
  for (const g of h.byModel) lines.push(`  ${g.model}: ${g.count} project${g.count === 1 ? "" : "s"}, ${money(g.fee)} for ${g.hours} h = ${money(g.effective)}/h`);
  lines.push("", "Worst effective hourly first:");
  h.projects.forEach((p, i) => lines.push(`  ${i + 1}. ${p.name} (${p.model})  ${money(p.fee)} for ${p.hours} h = ${money(p.effective)}/h  ${p.atTarget ? "at target" : `short ${money(p.shortfall)} of ${money(p.neededFee)}`}`));
  lines.push("", `Total ${money(h.fee)}, ${h.hours} hours, blended ${money(h.blendedHourly)}/h`, MODEL_NOTE);
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
