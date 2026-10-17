#!/usr/bin/env node
// node cli.mjs --acres 10 --tons 3.5 --grape-price 2400 --dtc-price 32 --dtc-share 35 [--json]
// exit 0 when wine beats selling the grapes, 1 when selling the grapes wins
import { analyze } from "./calc.mjs";

const FLAGS = { "--acres": "acres", "--tons": "tonsPerAcre", "--grow": "growCostPerAcre", "--harvest": "harvestCostPerTon", "--grape-price": "grapePricePerTon",
  "--gal-per-ton": "gallonsPerTon", "--loss": "wineLossPct", "--cellar": "cellarCostPerCase", "--package": "packageCostPerBottle", "--fixed": "fixedCostPerYear",
  "--excise": "exciseTaxPerGallon", "--dtc-share": "dtcShare", "--dtc-price": "dtcPricePerBottle", "--dtc-cost": "dtcCostPct", "--wholesale": "wholesalePricePerBottle",
  "--marketing": "marketingPct", "--unsold": "unsoldPct" };
const input = {};
let json = false;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--json") json = true;
  else if (FLAGS[args[i]]) input[FLAGS[args[i]]] = Number(args[++i]);
  else { console.error(`unknown option ${args[i]}`); process.exit(2); }
}
if (!input.acres || !input.tonsPerAcre) { console.error(`usage: node cli.mjs --acres <n> --tons <t/acre> [${Object.keys(FLAGS).slice(2).join(" ")}] [--json]`); process.exit(2); }
const r = analyze(input);
if (r.error) { console.error(r.error); process.exit(2); }
if (json) console.log(JSON.stringify(r, null, 2));
else for (const t of r.advice) console.log(`- ${t}`);
process.exit(r.winner === "wine" ? 0 : 1);
