#!/usr/bin/env node
// node cli.mjs --hours 5 --cups-hour 40 --price 5.75 --cups 140 --fee 350 --share 15 --guarantee 100 --guarantee-price 4.5 [--json]
// exit 1 when no deal covers cost
import { analyze } from "./calc.mjs";

const FLAGS = { "--hours": "hours", "--cups-hour": "cupsPerHour", "--price": "avgPrice", "--cogs": "cogsPerCup", "--staff": "staffCount", "--wage": "wage", "--setup": "setupHours", "--travel": "travelCost", "--permit": "permitFee", "--cups": "expectedCups", "--fee": "flatFee", "--share": "sharePct", "--guarantee": "guaranteeCups", "--guarantee-price": "guaranteePrice" };
const input = {};
let json = false;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--json") json = true;
  else if (FLAGS[args[i]]) input[FLAGS[args[i]]] = Number(args[++i]);
  else { console.error(`unknown option ${args[i]}`); process.exit(2); }
}
if (!input.hours || !input.avgPrice) { console.error("usage: node cli.mjs --hours <h> --price <$/drink> [--cups-hour n] [--cups expected] [--cogs $] [--staff n] [--wage $] [--setup h] [--travel $] [--permit $] [--fee $] [--share %] [--guarantee cups] [--guarantee-price $] [--json]"); process.exit(2); }
const r = analyze(input);
if (r.error) { console.error(r.error); process.exit(2); }
if (json) console.log(JSON.stringify(r, null, 2));
else for (const t of r.advice) console.log(`- ${t}`);
process.exit(r.anyProfit ? 0 : 1);
