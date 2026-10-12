#!/usr/bin/env node
// node cli.mjs --acres 640 --forage 1800 --use 35 --days 180 --rent 24 [--hay 190] [--alt 14] [--json]
// exit 1 when no rent works for both owner and rancher
import { analyze, money } from "./calc.mjs";

const FLAGS = { "--acres": "acres", "--forage": "forageLbsPerAcre", "--use": "usePct", "--days": "seasonDays", "--rent": "rentPerAum", "--au-per-head": "auPerHead", "--alt": "cashRentAlt", "--owner-cost": "ownerCostPerAcre", "--hay": "hayPerTon", "--hay-dm": "hayDmPct", "--waste": "hayWastePct", "--extra": "extraCostPerAum", "--intake": "auLbsPerDay" };
const input = {};
let json = false;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--json") json = true;
  else if (FLAGS[args[i]]) input[FLAGS[args[i]]] = Number(args[++i]);
  else { console.error(`unknown option ${args[i]}`); process.exit(2); }
}
if (!input.acres || !input.forageLbsPerAcre) { console.error("usage: node cli.mjs --acres <n> --forage <lb/acre> [--use %] [--days n] [--rent $/AUM] [--au-per-head n] [--alt $/acre] [--owner-cost $/acre] [--hay $/ton] [--hay-dm %] [--waste %] [--extra $/AUM] [--intake lb/day] [--json]"); process.exit(2); }
const r = analyze(input);
if (r.error) { console.error(r.error); process.exit(2); }
if (json) console.log(JSON.stringify(r, null, 2));
else {
  console.log(`${Math.round(r.aums)} AUMs, ${Math.round(r.head)} head, rent ${money(r.rentTotal)} (${money(r.rentPerAcre)}/acre), hay ${money(r.hayCostPerAum)}/AUM`);
  for (const t of r.advice) console.log(`- ${t}`);
}
process.exit(r.dealExists ? 0 : 1);
