#!/usr/bin/env node
// node cli.mjs --seed 150000 --survival 70 --price 0.70 --months 16 [--seed-cost 30] [--json]
// exit 1 when the cycle loses money at the entered price
import { analyze, money, money2 } from "./calc.mjs";

const FLAGS = { "--seed": "seedCount", "--seed-cost": "seedCostPer1000", "--survival": "survivalPct", "--grade": "marketablePct", "--price": "pricePerOyster", "--months": "growMonths", "--per-bag": "stockingPerBag", "--bag-cost": "bagCost", "--gear-life": "gearLifeYears", "--handlings": "handlingsPerBag", "--minutes": "minutesPerHandling", "--labor": "laborRate", "--lease": "leasePerYear", "--boat": "boatPerMonth", "--capital": "capitalRatePct" };
const input = {};
let json = false;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--json") json = true;
  else if (FLAGS[args[i]]) input[FLAGS[args[i]]] = Number(args[++i]);
  else { console.error(`unknown option ${args[i]}`); process.exit(2); }
}
if (!input.seedCount) { console.error("usage: node cli.mjs --seed <count> [--seed-cost $/1000] [--survival %] [--grade %] [--price $] [--months n] [--per-bag n] [--bag-cost $] [--gear-life yrs] [--handlings n] [--minutes n] [--labor $/h] [--lease $/yr] [--boat $/mo] [--capital %] [--json]"); process.exit(2); }
const r = analyze(input);
if (r.error) { console.error(r.error); process.exit(2); }
if (json) console.log(JSON.stringify(r, null, 2));
else {
  console.log(`${r.sold} oysters, cost ${money2(r.costPerOyster)} each, profit ${money(r.profit)} on ${money(r.total)} of cost`);
  for (const t of r.advice) console.log(`- ${t}`);
}
process.exit(r.viable ? 0 : 1);
