#!/usr/bin/env node
// Zero-dependency CLI: compare snow plow contract models across a low, normal and
// high snow year, or audit past seasons by contract model. No network call --
// local files/stdin only.
//
//   node cli.mjs compare --sites fixtures/sites.csv --target 35
//   node cli.mjs compare --normal 12,6,3 --json
//   node cli.mjs audit fixtures/seasons.csv --target 35
//   cat seasons.csv | node cli.mjs audit - --json

import fs from "node:fs/promises";
import { compare, summarizeCompare, parseSites, DEFAULT_SITES_CSV, parseSeasons, audit, summarizeAudit, money, MODEL_NOTE } from "./engine.mjs";

const FLAGS = {
  "--low": "lowEvents", "--normal": "normalEvents", "--high": "highEvents", "--probs": "probs",
  "--light-depth": "lightDepth", "--medium-depth": "mediumDepth", "--heavy-depth": "heavyDepth",
  "--light-time": "lightTime", "--medium-time": "mediumTime", "--heavy-time": "heavyTime",
  "--truck": "truckRate", "--fuel": "fuelPerHr", "--blade": "bladeWearPerHr", "--deadhead": "deadheadMin",
  "--salt-cost": "saltCostPerLb", "--target": "targetHourly", "--walkaway": "walkAwayPct",
  "--tier-break": "tierBreakInches", "--tier-uplift": "tierUpliftPct", "--cap": "capEvents",
  "--hybrid-base": "hybridBasePct", "--hybrid-push": "hybridPushPct",
};

function parseArgs(argv) {
  const args = { json: false, positional: [], opts: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--sites") { args.hasSites = true; args.sites = argv[++i] ?? ""; }
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
  "  node cli.mjs compare [--sites sites.csv|-] [--low 6,3,0] [--normal 10,6,2] [--high 14,10,5] [--probs 25,50,25]",
  "                       [--light-depth 2] [--medium-depth 4] [--heavy-depth 8] [--light-time 0.8] [--medium-time 1] [--heavy-time 1.5]",
  "                       [--truck 55] [--fuel 15] [--blade 5] [--deadhead 12] [--salt-cost 0.1] [--target 35] [--walkaway 75]",
  "                       [--tier-break 6] [--tier-uplift 25] [--cap 10] [--hybrid-base 40] [--hybrid-push 60] [--json]",
  "  node cli.mjs audit <seasons.csv|-> [--truck 55] [--fuel 15] [--blade 5] [--target 35] [--json]",
  "",
  "Storm counts are light,medium,heavy per year. Sites rows: name,hours,perPush,seasonalFlat,perInch,trigger[,saltLbs]",
  "Without --sites the three example sites are used.",
  "Season rows: site,model,revenue,hours[,season]   (model is any label, for example per-push, per-inch, seasonal, hybrid)",
  `Up to 200 sites and 500 season rows. ${MODEL_NOTE}`,
].join("\n");

const fmt = (v) => (v === null ? "n/a" : money(v));
const storms = (v, lose) => (lose ? "loses on every storm" : v === null ? "not within 6x" : `${v.toFixed(1)} storms`);

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
  if (args.sub === "compare") {
    let text = DEFAULT_SITES_CSV;
    if (args.hasSites) {
      if (args.sites === "" || (args.sites.startsWith("-") && args.sites !== "-")) return bad("--sites needs a file, or - for stdin");
      try { text = args.sites === "-" ? await readStdin() : await io.readFile(args.sites); } catch (e) { return bad(`Cannot read ${args.sites}: ${e.message}`); }
    }
    const parsed = parseSites(text);
    if (parsed.errors.length) return bad(parsed.errors.join("\n"));
    if (!parsed.sites.length) return bad("No site rows found");
    let c;
    try { c = compare(parsed.sites, opts); } catch (e) { return bad(e.message); }
    if (args.json) return { exitCode: 0, output: JSON.stringify(c, null, 2) };
    const s = c.seasons;
    const lines = [summarizeCompare(c).text, ""];
    lines.push("Year     Plows   Hours    Cost to run");
    for (const y of ["low", "normal", "high"]) lines.push(`${y.padEnd(8)} ${s[y].plows.toFixed(0).padStart(5)} ${s[y].hours.toFixed(1).padStart(7)} ${money(s[y].cost).padStart(14)}`);
    lines.push("", "Model                              Expected rev  Low/h     Normal/h  High/h    Falls under target at   Loses money at");
    for (const m of c.models) {
      lines.push(`${m.label.padEnd(34)} ${money(m.revenue.weighted).padStart(12)} ${fmt(m.effective.low).padStart(9)} ${fmt(m.effective.normal).padStart(9)} ${fmt(m.effective.high).padStart(9)}    ${storms(m.targetStorms, false).padEnd(22)}  ${storms(m.breakEvenStorms, m.losesEveryStorm)}`);
    }
    const f = c.flat;
    lines.push("", `Seasonal flat, all sites: you quote ${money(f.current)}`);
    lines.push(`  needed for target:  low year ${money(f.neededForTarget.low)}   normal ${money(f.neededForTarget.normal)}   high ${money(f.neededForTarget.high)}`);
    lines.push(`  loses money below:  low year ${money(f.loseMoneyBelow.low)}   normal ${money(f.loseMoneyBelow.normal)}   high ${money(f.loseMoneyBelow.high)}`);
    lines.push(`  walk-away price:    ${money(f.walkAway)}`);
    lines.push("", "Site                       Quote   Target (low/normal/high)                       Loses money in high year below   Walk-away");
    for (const p of c.perSite) lines.push(`${p.name.padEnd(26)} ${money(p.current).padStart(9)}   ${[p.neededForTarget.low, p.neededForTarget.normal, p.neededForTarget.high].map(money).join(" / ").padEnd(46)} ${money(p.loseMoneyBelow.high).padStart(10)}   ${money(p.walkAway).padStart(10)}`);
    lines.push("", MODEL_NOTE);
    return { exitCode: 0, output: lines.join("\n") };
  }
  const file = args.positional[0];
  if (!file) return bad("Give a seasons file, or - for stdin");
  let text;
  try { text = file === "-" ? await readStdin() : await io.readFile(file); } catch (e) { return bad(`Cannot read ${file}: ${e.message}`); }
  const parsed = parseSeasons(text);
  if (parsed.errors.length) return bad(parsed.errors.join("\n"));
  if (!parsed.rows.length) return bad("No season rows found");
  let a;
  try { a = audit(parsed, opts); } catch (e) { return bad(e.message); }
  if (args.json) return { exitCode: 0, output: JSON.stringify(a, null, 2) };
  const lines = [summarizeAudit(a).text, "", "By contract model (best net hourly first):"];
  for (const g of a.byModel) lines.push(`  ${g.model}: ${g.count} row${g.count === 1 ? "" : "s"}, ${money(g.revenue)} for ${g.hours} h = ${money(g.gross)}/h gross, ${money(g.net)}/h net`);
  lines.push("", "Worst net hourly first:");
  a.rows.forEach((r, i) => lines.push(`  ${i + 1}. ${r.name} (${r.model})  ${money(r.revenue)} for ${r.hours} h = ${money(r.net)}/h net  ${r.atTarget ? "at target" : `short ${money(r.shortfall)}`}`));
  lines.push("", `Total ${money(a.revenue)}, ${a.hours} hours, blended ${money(a.blendedNet)}/h net`, MODEL_NOTE);
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
