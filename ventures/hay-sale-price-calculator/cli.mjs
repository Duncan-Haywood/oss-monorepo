#!/usr/bin/env node
// node cli.mjs --acres 80 --tons 4 --grow 240 --make 30 --small 8 --large 130 --round 95 [--json]
// exit 1 when no channel covers cost
import { analyze, money } from "./calc.mjs";

const FLAGS = { "--acres": "acres", "--tons": "tonsPerAcre", "--grow": "growCostPerAcre", "--make": "makeCostPerTon", "--loss": "storageLossPct", "--small": "smallPrice", "--large": "largePrice", "--round": "roundPrice", "--small-lbs": "smallBaleLbs", "--large-lbs": "largeBaleLbs", "--round-lbs": "roundBaleLbs" };
const input = {};
let json = false;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--json") json = true;
  else if (FLAGS[args[i]]) input[FLAGS[args[i]]] = Number(args[++i]);
  else { console.error(`unknown option ${args[i]}`); process.exit(2); }
}
if (!input.acres || !input.tonsPerAcre) { console.error("usage: node cli.mjs --acres <n> --tons <t/acre> [--grow $/acre] [--make $/ton] [--loss %] [--small $/bale] [--large $/bale] [--round $/bale] [--small-lbs n] [--large-lbs n] [--round-lbs n] [--json]"); process.exit(2); }
const r = analyze(input);
if (r.error) { console.error(r.error); process.exit(2); }
if (json) console.log(JSON.stringify(r, null, 2));
else for (const t of r.advice) console.log(`- ${t}`);
process.exit(r.anyProfit ? 0 : 1);
