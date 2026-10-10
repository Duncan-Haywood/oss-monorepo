#!/usr/bin/env node
// node cli.mjs --seed 250000 --mortality 25 --months 20 [--premium-price 0.85] [--commission 10] [--json]
// exit 1 when the crop loses money or leaves under 15% of sales
import { check, money } from "./calc.mjs";

const FLAGS = { "--seed": "seed", "--seed-cost": "seedCostPerK", "--mortality": "mortalityPct", "--months": "growoutMonths", "--per-bag": "oystersPerBag", "--bag-cost": "bagCost", "--rack-cost": "rackCostPerBag", "--gear-life": "gearLifeYears", "--premium": "premiumPct", "--standard": "standardPct", "--premium-price": "premiumPrice", "--standard-price": "standardPrice", "--cull-price": "cullPrice", "--commission": "commissionPct", "--hours": "hoursPerBagMonth", "--labor-rate": "laborRate", "--boat": "boatCostPerMonth", "--lease": "leasePerYear", "--other": "otherPerYear", "--pack": "packPerOyster", "--interest": "interestPct" };
const input = {};
let json = false;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--json") json = true;
  else if (FLAGS[args[i]]) input[FLAGS[args[i]]] = Number(args[++i]);
  else { console.error(`unknown option ${args[i]}`); process.exit(2); }
}
if (!input.seed) { console.error("usage: node cli.mjs --seed <n> [--seed-cost $/1000] [--mortality %] [--months n] [--per-bag n] [--premium %] [--standard %] [--premium-price $] [--standard-price $] [--cull-price $] [--commission %] [--hours n] [--labor-rate $] [--boat $/mo] [--lease $/yr] [--other $/yr] [--interest %] [--json]"); process.exit(2); }
const r = check(input);
if (r.error) { console.error(r.error); process.exit(2); }
if (json) console.log(JSON.stringify(r, null, 2));
else {
  console.log(`Sales ${money(r.revenue)}  costs ${money(r.totalCost)}  net ${money(r.net)}  break-even $${r.breakEvenBlendedPrice.toFixed(2)}/oyster  cash before first sale ${money(r.cashBeforeFirstSale)}`);
  for (const [k, x] of Object.entries(r.costs)) console.log(`  ${k.padEnd(10)} ${money(x).padStart(10)}`);
  for (const t of r.advice) console.log(`- ${t}`);
}
process.exit(r.loses || r.thin ? 1 : 0);
