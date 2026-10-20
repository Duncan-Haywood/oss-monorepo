#!/usr/bin/env node
// CLI: price a list of scope-creep requests as a change order.
//   node cli.mjs --price 6000 --hours 60 --file requests.txt --premium 15 --client Acme
//   cat requests.txt | node cli.mjs --price 6000 --hours 60 --format csv
// requests.txt: one "Request title | hours" per line (hours, 6h or 1.5d).
// Exit 0 ok, 1 over --max-creep-pct / --max-absorbed, 2 bad input. No network.
import { readFileSync } from "node:fs";
import { parseRequests, calculate, toMarkdown, toCsv, gate } from "./engine.mjs";

const USAGE = `usage: node cli.mjs --price <quoted price> --hours <quoted hours> [--file requests.txt] [options]
options: --rate <per hour> --premium <pct> --buffer <pct> --per-day <hours=6> --format md|csv|json
         --client <text> --project <text> --currency <symbol=$> --max-creep-pct <n> --max-absorbed <n>`;
const fail = (m) => { console.error(m); process.exit(2); };
const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith("--")) fail(`unexpected argument "${argv[i]}"\n${USAGE}`);
  if (argv[i + 1] === undefined) fail(`${argv[i]} needs a value\n${USAGE}`);
  opt[argv[i].slice(2)] = argv[++i];
}
const n = (k) => (opt[k] === undefined ? undefined : Number.isFinite(Number(opt[k])) && Number(opt[k]) >= 0 ? Number(opt[k]) : fail(`--${k} must be a non-negative number`));
let text;
try { text = readFileSync(opt.file || 0, "utf8"); } catch (e) { fail(`cannot read requests: ${e.message}`); }
const { items, bad } = parseRequests(text);
if (bad.length) console.error(`${bad.length} line(s) skipped (expected "title | hours"): ${bad.map((b) => b.line).join(", ")}`);
if (!items.length) fail(`no requests found\n${USAGE}`);
if (!n("rate") && !(n("price") > 0 && n("hours") > 0)) fail(`need --rate, or both --price and --hours\n${USAGE}`);
const r = calculate(items, { basePrice: n("price") ?? 0, baseHours: n("hours") ?? 0, rate: n("rate") ?? 0, premiumPct: n("premium") ?? 0, bufferPct: n("buffer") ?? 0, hoursPerDay: n("per-day") ?? 6 });
const fmt = opt.format || "md";
if (fmt === "json") console.log(JSON.stringify(r, null, 2));
else if (fmt === "csv") process.stdout.write(toCsv(r));
else process.stdout.write(toMarkdown(r, { client: opt.client, project: opt.project, currency: opt.currency || "$" }));
const problems = gate(r, { maxCreepPct: n("max-creep-pct"), maxAbsorbed: n("max-absorbed") });
for (const p of problems) console.error(`FAIL: ${p}`);
process.exit(problems.length ? 1 : 0);
