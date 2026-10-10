#!/usr/bin/env node
// node cli.mjs --acres 240 --rent 850 --escalator 1.5 --term 35 --alt 300 [--option-years 3] [--option-pay 25] [--bonus 0] [--discount 6] [--json]
// exit 1 when the offer is worth less than keeping the land in its current use
import { analyze, money } from "./calc.mjs";

const FLAGS = { "--acres": "acres", "--rent": "rentPerAcre", "--escalator": "escalatorPct", "--term": "termYears", "--option-years": "optionYears", "--option-pay": "optionPerAcre", "--farm-during-option": "farmDuringOption", "--bonus": "signingBonusPerAcre", "--alt": "altCashRent", "--alt-growth": "altGrowthPct", "--discount": "discountPct", "--extra-tax": "extraTaxPerAcre", "--rollback": "rollbackPerAcre", "--acres-per-mw": "acresPerMw", "--capacity-factor": "capacityFactorPct", "--power-price": "powerPricePerMwh" };
const input = {};
let json = false;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--json") json = true;
  else if (FLAGS[args[i]]) input[FLAGS[args[i]]] = Number(args[++i]);
  else { console.error(`unknown option ${args[i]}`); process.exit(2); }
}
if (!input.acres || input.rentPerAcre === undefined) { console.error("usage: node cli.mjs --acres <n> --rent <$/acre/yr> [--escalator %] [--term years] [--option-years n] [--option-pay $/acre] [--bonus $/acre] [--alt $/acre] [--alt-growth %] [--discount %] [--extra-tax $/acre] [--rollback $/acre] [--json]"); process.exit(2); }
const r = analyze(input);
if (r.error) { console.error(r.error); process.exit(2); }
if (json) console.log(JSON.stringify(r, null, 2));
else {
  console.log(`year-1 rent ${money(r.year1Rent)}, PV of lease ${money(r.npvLease)} vs ${money(r.npvAlt)} keeping the land as is (${r.npvGain >= 0 ? "+" : ""}${money(r.npvGain)})`);
  for (const t of r.advice) console.log(`- ${t}`);
}
process.exit(r.offerBeatsAlternative ? 0 : 1);
