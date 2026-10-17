#!/usr/bin/env node
// node cli.mjs --logs 24 --dia 14 --len 10 --rate 0.55 --hourly 85 [--json]
// exit 1 when the better pricing model still loses money on the job
import { analyze } from "./calc.mjs";

const FLAGS = { "--logs": "logs", "--dia": "smallEndIn", "--len": "lengthFt", "--rate": "ratePerBf", "--hourly": "hourlyRate", "--bfph": "bfPerHour", "--helpers": "helpers", "--helper-wage": "helperWage", "--owner-wage": "ownerWage", "--mill": "millPrice", "--hours": "annualHours", "--recovery": "recoveryPct", "--miles": "tripMiles", "--margin": "marginPct" };
const input = {};
let json = false;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--json") json = true;
  else if (FLAGS[args[i]]) input[FLAGS[args[i]]] = Number(args[++i]);
  else { console.error(`unknown option ${args[i]}`); process.exit(2); }
}
if (!input.logs || !input.smallEndIn) { console.error("usage: node cli.mjs --logs <n> --dia <small-end in> [--len ft] [--rate $/bf] [--hourly $/hr] [--bfph n] [--helpers n] [--helper-wage $] [--owner-wage $] [--mill $] [--hours n] [--recovery %] [--miles n] [--margin %] [--json]"); process.exit(2); }
const r = analyze(input);
if (r.error) { console.error(r.error); process.exit(2); }
if (json) console.log(JSON.stringify(r, null, 2));
else for (const t of r.advice) console.log(`- ${t}`);
process.exit(r.profitable ? 0 : 1);
