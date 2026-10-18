#!/usr/bin/env node
// Zero-dependency CLI: read a day's grooming requests and print which to book
// for the most net under the table minutes, plus what to charge for one groom.
// No network call -- local file/stdin only.
//
//   node cli.mjs plan requests.csv --capacity 480 --turnover 10 --target-hourly 45 --max-large 2
//   cat requests.csv | node cli.mjs plan - --json
//   node cli.mjs price --minutes 80 --supplies 6 --target-hourly 45

import fs from "node:fs/promises";
import { parseRequests, plan, summarize, quotePrice, money, MODEL_NOTE } from "./engine.mjs";

const FLAGS = {
  "--capacity": "capacity", "--turnover": "turnover", "--target-hourly": "targetHourly", "--max-dogs": "maxDogs",
  "--max-large": "maxLarge", "--no-show": "noShow", "--minutes": "minutes", "--supplies": "supplies", "--round-to": "roundTo",
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
  "  node cli.mjs plan <requests.csv|-> [--capacity 480] [--turnover 10] [--target-hourly 45] [--max-dogs 0] [--max-large 0] [--no-show 10] [--json]",
  "  node cli.mjs price --minutes 80 [--supplies 6] [--turnover 10] [--target-hourly 45] [--round-to 1] [--json]",
  "",
  "Rows: dog,size,groom_minutes,price,supplies[,note]  (size: small, medium, large, giant)",
  "--capacity       table minutes in the day (default 480)",
  "--turnover       minutes between dogs, added to every groom (default 10)",
  "--target-hourly  net dollars you want per table hour (default 45)",
  "--max-dogs       most dogs in the day, 0 = no limit (default 0)",
  "--max-large      most large and giant dogs, 0 = no limit (default 0)",
  "--no-show        percent of booked dogs that fail to show, for the downside check (default 10)",
  "Exit 2 on bad input. Numbers are the ones you supply, not a forecast. No network call.",
].join("\n");

function bad(msg) {
  return { exitCode: 2, output: `${msg}\n\n${USAGE}` };
}

export async function run(argv, io = { readFile: (p) => fs.readFile(p, "utf8") }) {
  const args = parseArgs(argv);
  if (args.help) return { exitCode: 0, output: USAGE };
  if (args.unknown) return bad(`Unknown option ${args.unknown}`);
  const opts = {};
  for (const [flag, v] of Object.entries(args.opts)) {
    if (!(v !== undefined && v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0)) return bad(`${flag} needs a number, zero or more`);
    opts[FLAGS[flag]] = v;
  }
  if (args.sub === "price") {
    try {
      const q = quotePrice(opts);
      if (args.json) return { exitCode: 0, output: JSON.stringify(q, null, 2) };
      return { exitCode: 0, output: `Charge ${money(q.price)} (exact ${money(q.exact)}) for ${q.tableMinutes} table minutes: nets ${money(q.netPerHour)} per table hour.` };
    } catch (e) {
      return bad(e.message);
    }
  }
  if (args.sub !== "plan") return bad(args.sub ? `Unknown command ${args.sub}` : "Missing command");
  const file = args.positional[0];
  if (!file) return bad("Missing requests file (use - for stdin)");
  let text;
  try {
    text = file === "-" ? await readStdin() : await io.readFile(file);
  } catch (e) {
    return bad(`Cannot read ${file}: ${e.message}`);
  }
  const parsed = parseRequests(text);
  if (parsed.errors.length) return bad(parsed.errors.join("\n"));
  if (!parsed.requests.length) return bad("No request rows found");
  let p;
  try {
    p = plan(parsed, opts);
  } catch (e) {
    return bad(e.message);
  }
  if (args.json) return { exitCode: 0, output: JSON.stringify(p, null, 2) };
  const lines = [summarize(p).text, "", "Every request, by net per table hour:"];
  for (const r of p.ranked) {
    lines.push(`  ${String(r.rank).padStart(2)}. ${r.name} (${r.size})  ${r.minutes} min  price ${money(r.price)}  net ${money(r.net)}  ${money(r.netPerHour)}/table hr${r.raiseBy > 0 ? `  target price ${money(r.priceForTarget)}` : ""}${r.booked ? "  BOOK" : ""}`);
  }
  lines.push("", "Book:");
  for (const c of p.chosen) lines.push(`  + ${c.name} (${c.size})  ${c.tableMinutes} table min  net ${money(c.net)}`);
  if (!p.chosen.length) lines.push("  (none)");
  lines.push("", "Skip:");
  for (const s of p.skipped) lines.push(`  - ${s.name} -- ${s.reason}`);
  if (!p.skipped.length) lines.push("  (none)");
  for (const f of p.findings) lines.push("", `[${f.severity}] ${f.rule}: ${f.message}`);
  const t = p.totals;
  lines.push("", `Plan ${money(t.plan)} | arrival order ${money(t.firstCome)} | highest price first ${money(t.topPriceFirst)} | ${p.options.noShow}% no-shows ${money(t.downsidePlan)}`);
  lines.push(MODEL_NOTE);
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
