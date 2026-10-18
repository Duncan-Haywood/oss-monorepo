#!/usr/bin/env node
// Zero-dependency CLI: audit a pool service route from a CSV of accounts. No
// network call -- local files/stdin only.
//
//   node cli.mjs audit fixtures/accounts.csv --target 40
//   node cli.mjs audit accounts.csv --csv > audit.csv
//   cat accounts.csv | node cli.mjs audit - --json
//   node cli.mjs stop fixtures/accounts.csv --leg 15 --price 140

import fs from "node:fs/promises";
import { analyze, summarize, parseAccounts, toCsv, money, MODEL_NOTE } from "./engine.mjs";

const FLAGS = {
  "--visits": "visitsPerMonth", "--truck": "truckPerHr", "--helper": "laborPerHr",
  "--callback-min": "callbackMin", "--callback-cost": "callbackCost", "--target": "targetHourly",
  "--max-increase": "maxIncreasePct", "--leg": "newLegMin", "--price": "newPrice",
  "--visit-min": "newVisitMin", "--chem": "newChem", "--new-callbacks": "newCallbacks",
};

function parseArgs(argv) {
  const args = { json: false, csv: false, positional: [], opts: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--csv") args.csv = true;
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
  "  node cli.mjs audit <accounts.csv|-> [--visits 4.33] [--truck 14] [--helper 0] [--callback-min 45] [--callback-cost 15]",
  "                       [--target 40] [--max-increase 15] [--csv | --json]",
  "  node cli.mjs stop  <accounts.csv|-> [--leg 15] [--price 140] [--visit-min 25] [--chem 30] [--new-callbacks 1] [same cost flags] [--json]",
  "",
  "Account rows: name,price,visitMin,driveMin,chemicals,callbacks   (price and chemicals per month, callbacks per year;",
  "a header row may reorder the columns). Up to 300 accounts.",
  `audit ranks every account by true effective hourly, with a keep, reprice or drop move. stop shows what adding a stop at --leg drive minutes does to the route. ${MODEL_NOTE}`,
].join("\n");

const hr = (v) => (v === null ? "n/a" : money(v));

export async function run(argv, io = { readFile: (f) => fs.readFile(f, "utf8") }) {
  const args = parseArgs(argv);
  const bad = (message) => ({ exitCode: 2, output: `${message}\n\n${USAGE}` });
  if (args.help) return { exitCode: 0, output: USAGE };
  if (args.unknown) return bad(`Unknown option ${args.unknown}`);
  if (args.sub !== "audit" && args.sub !== "stop") return bad("Expected the audit or stop command");
  const opts = {};
  for (const [flag, v] of Object.entries(args.opts)) {
    if (v === undefined || v === "") return bad(`${flag} needs a value`);
    opts[FLAGS[flag]] = v;
  }
  const file = args.positional[0];
  if (!file) return bad("Give an accounts file, or - for stdin");
  let text;
  try { text = file === "-" ? await readStdin() : await io.readFile(file); } catch (e) { return bad(`Cannot read ${file}: ${e.message}`); }
  const parsed = parseAccounts(text);
  if (parsed.errors.length) return bad(parsed.errors.join("\n"));
  if (!parsed.accounts.length) return bad("No account rows found");
  let res;
  try { res = analyze(parsed.accounts, opts); } catch (e) { return bad(e.message); }
  if (args.sub === "audit" && args.csv) return { exitCode: 0, output: toCsv(res).trimEnd() };
  if (args.json) return { exitCode: 0, output: JSON.stringify(res, null, 2) };
  const r = res.route;
  const lines = [];
  if (args.sub === "audit") {
    lines.push(summarize(res).text, "", "Account                    Price   Hours   Net/mo    Effective/h  Price for target  Move     Route/h if dropped");
    for (const x of res.rows) {
      lines.push(`${x.name.padEnd(26)} ${money(x.price).padStart(7)} ${x.hours.toFixed(1).padStart(7)} ${money(x.net).padStart(9)} ${money(x.effective).padStart(12)} ${money(x.needed).padStart(17)}  ${x.move.padEnd(8)} ${hr(x.routeHourlyIfDropped).padStart(10)}`);
    }
    lines.push("", `Route: ${money(r.revenue)} a month for ${r.hours.toFixed(1)} hours = ${money(r.blended)}/h after chemicals, truck and callbacks; driving ${(r.driveShare * 100).toFixed(0)}% of hours.`);
  }
  const n = res.newStop;
  lines.push("", `A new stop: ${money(n.price)} a month, ${res.options.newVisitMin} min on site, ${res.options.newLegMin} min drive earns ${money(n.effective)}/h and moves the route from ${money(r.blended)} to ${money(n.routeAfter)}/h.`);
  lines.push("Drive minutes   Effective/h   Price for target   Route/h after");
  for (const d of res.density) lines.push(`${String(d.legMin).padStart(13)}   ${money(d.effective).padStart(11)}   ${money(d.needed).padStart(16)}   ${money(d.routeAfter).padStart(13)}`);
  lines.push("", MODEL_NOTE);
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
