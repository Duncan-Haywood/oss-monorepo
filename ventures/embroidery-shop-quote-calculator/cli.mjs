#!/usr/bin/env node
// Zero-dependency CLI: quote embroidery jobs from a CSV of jobs (or one job
// from flags), with the shop's machine and cost numbers as flags. Prints the
// quote, true cost, effective hourly rate, a quantity-break table, a stitch
// count sensitivity, the flat per-1000 rule check and a take/counter/pass
// verdict. No network call -- local file/stdin only.
//
//   node cli.mjs quote jobs.csv --heads 2 --spm 650 --margin 40 --min-charge 75 --min-hourly 35
//   node cli.mjs quote --quantity 24 --garment-cost 4.5 --stitches 7500 --colors 4 --json
//   cat jobs.csv | node cli.mjs quote - --flat-per-1000 1

import fs from "node:fs/promises";
import { analyze, parseJobs, summarize, money, cents, pct, MODEL_NOTE } from "./engine.mjs";

const FLAGS = {
  "--quantity": "quantity", "--garment-cost": "garmentCost", "--stitches": "stitches", "--colors": "colors", "--digitizing-fee": "digitizingFee",
  "--offer-per-piece": "offerPerPiece",
  "--heads": "heads", "--spm": "spm", "--efficiency": "efficiency", "--hoop-min": "hoopMin", "--setup-job-min": "setupJobMin",
  "--setup-color-min": "setupColorMin", "--color-change-sec": "colorChangeSec", "--material-per-1000": "materialPer1000",
  "--labor-rate": "laborRate", "--overhead-per-hour": "overheadPerHour", "--margin": "margin", "--min-charge": "minCharge",
  "--rush": "rushPct", "--min-hourly": "minHourly", "--flat-per-1000": "flatPer1000", "--breaks": "breakQtys",
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
  "  node cli.mjs quote [jobs.csv|-] [shop and job flags] [--json]",
  "",
  "Rows: name,quantity,garment_cost,stitches,colors,digitizing_fee[,offer_per_piece]  (header row optional; blank cells use the flags/defaults)",
  "With no file, one job is quoted from the flags alone.",
  "Job:   --quantity 24 --garment-cost 4.50 --stitches 7500 --colors 4 --digitizing-fee 25 --offer-per-piece 18",
  "Shop:  --heads 2 --spm 650 --efficiency 75 --hoop-min 1.5 --setup-job-min 15 --setup-color-min 2 --color-change-sec 8",
  "       --material-per-1000 0.10 --labor-rate 20 --overhead-per-hour 10",
  "Price: --margin 40 --min-charge 75 --rush 0 --min-hourly 35 --flat-per-1000 1 --breaks 12,24,48,100,250",
  "--efficiency is the percent of rated speed you really get; --margin is profit as a percent of the quote.",
  "Exit 2 on bad input. Numbers are the ones you supply, not a forecast. No network call.",
].join("\n");

function bad(msg) {
  return { exitCode: 2, output: `${msg}\n\n${USAGE}` };
}

function render(name, a) {
  const q = a.quote;
  const c = q.cost;
  const lines = [`== ${name} ==`, summarize(a).text, ""];
  lines.push(`Clock time ${c.minutes.total.toFixed(1)} min (setup ${c.minutes.setup.toFixed(1)}, ${c.minutes.hoops} hoops x ${c.minutes.hoopRunMin.toFixed(2)} min, hooping ${c.minutes.handling.toFixed(1)}).`);
  lines.push(`True cost ${cents(c.total)}: garments ${cents(c.garments)}, thread/backing ${cents(c.materials)}, labor ${cents(c.labor)}, overhead ${cents(c.overhead)}, digitizing ${cents(c.digitizing)}.`);
  if (a.offerTotal !== null) lines.push(`Offered ${cents(a.offerTotal)} (${money(a.job.offerPerPiece)} a piece): profit ${cents(a.verdict.profit)}, ${pct(a.verdict.margin, 1)} margin, ${money(a.verdict.effectiveHourly)} an hour.`);
  lines.push("", "Quantity breaks (quote at your target margin vs the flat per-1000 rule):");
  lines.push("   qty  per piece      total  drop  $/hr   setup%  flat/pc    flat profit  note");
  for (const b of a.breaks) {
    const notes = [b.minChargeBinds ? "min charge" : "", b.setupDominates ? "setup dominates" : "", b.flat.losesMoney ? "flat rule LOSES money" : ""].filter(Boolean).join(", ");
    lines.push(`${String(b.qty).padStart(6)}  ${money(b.quote.perPieceCents / 100).padStart(9)}  ${cents(b.quote.total).padStart(9)}  ${(b.dropPct === null ? "-" : pct(b.dropPct)).padStart(4)}  ${money(b.quote.effectiveHourly).padStart(6)}  ${pct(b.quote.setupShare).padStart(5)}  ${money(b.flat.perPiece).padStart(7)}  ${cents(b.flat.profit).padStart(11)}  ${notes}`);
  }
  lines.push("", `Stitch count vs price at ${a.job.quantity} pieces (about ${money(a.sensitivity.pricePer1000)} more per piece for every extra 1000 stitches; your flat rule says ${money(a.job.flatPer1000)}):`);
  for (const r of a.sensitivity.rows) {
    lines.push(`  ${String(r.stitches).padStart(7)} stitches  ${money(r.quote.perPieceCents / 100).padStart(9)} a piece  ${cents(r.quote.total).padStart(10)} total  flat rule ${money(r.flat.perPiece)} (${cents(r.flat.profit)} profit)`);
  }
  for (const f of a.findings) lines.push("", `[${f.severity}] ${f.rule}: ${f.message}`);
  return lines.join("\n");
}

export async function run(argv, io = { readFile: (p) => fs.readFile(p, "utf8") }) {
  const args = parseArgs(argv);
  if (args.help) return { exitCode: 0, output: USAGE };
  if (args.unknown) return bad(`Unknown option ${args.unknown}`);
  if (args.sub !== "quote") return bad(args.sub ? `Unknown command ${args.sub}` : "Missing command");
  const flagInput = {};
  for (const [flag, v] of Object.entries(args.opts)) {
    if (v === undefined) return bad(`${flag} needs a value`);
    if (flag !== "--breaks" && !(v.trim() !== "" && Number.isFinite(Number(v)) && Number(v) >= 0)) return bad(`${flag} needs a number, zero or more`);
    flagInput[FLAGS[flag]] = v;
  }
  let jobs;
  const file = args.positional[0];
  if (file) {
    let text;
    try {
      text = file === "-" ? await readStdin() : await io.readFile(file);
    } catch (e) {
      return bad(`Cannot read ${file}: ${e.message}`);
    }
    const parsed = parseJobs(text);
    if (parsed.errors.length) return bad(parsed.errors.join("\n"));
    if (!parsed.jobs.length) return bad("No job rows found");
    jobs = parsed.jobs;
  } else {
    jobs = [{ name: "job", fields: {}, line: 0 }];
  }
  const results = [];
  for (const j of jobs) {
    try {
      // flags are the shop-wide defaults; a CSV cell is more specific, so it wins
      results.push({ name: j.name, ...analyze({ ...flagInput, ...j.fields }) });
    } catch (e) {
      return bad(`${j.line ? `line ${j.line} (${j.name}): ` : ""}${e.message}`);
    }
  }
  if (args.json) return { exitCode: 0, output: JSON.stringify(results.length === 1 && !file ? results[0] : results, null, 2) };
  const out = results.map((r) => render(r.name, r));
  if (results.length > 1) {
    out.push("", "Verdicts:");
    for (const r of results) out.push(`  ${r.verdict.status.toUpperCase().padEnd(7)} ${r.name}: ${cents(r.priced)} for ${r.job.quantity} pieces, ${money(r.verdict.effectiveHourly)} an hour`);
  }
  out.push("", MODEL_NOTE);
  return { exitCode: 0, output: out.join("\n") };
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
