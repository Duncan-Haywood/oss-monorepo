#!/usr/bin/env node
// node cli.mjs --acres 200 --rate 12 --hunters 6 --hunter-fee 600 [--fill 80] [--day-rate 150 --days 14] [--insurance 350] [--upkeep 400] [--admin 120] [--lost-use 300] [--tax-savings 0] [--platform-fee 0] [--json]
// exit 1 when no arrangement covers its costs
import { compare, sampleInputs, money } from "./calc.mjs";

const map = { "--acres": "acres", "--rate": "ratePerAcre", "--hunters": "hunters", "--hunter-fee": "perHunterFee", "--fill": "fillPct", "--day-rate": "dayRate", "--days": "daysSold", "--insurance": "insuranceCost", "--upkeep": "upkeepCost", "--admin": "adminCost", "--lost-use": "lostUseCost", "--tax-savings": "taxSavings", "--platform-fee": "platformFeePct" };
const input = Object.fromEntries(Object.keys(sampleInputs()).map((k) => [k, 0]));
input.fillPct = 100;
let json = false;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--json") json = true;
  else if (map[a]) input[map[a]] = Number(args[++i]);
  else { console.error(`unknown option ${a}`); process.exit(2); }
}
const c = compare(input);
if (c.error) { console.error(c.error); process.exit(2); }
if (json) console.log(JSON.stringify(c, null, 2));
else {
  for (const r of c.results) console.log(`${r.label.padEnd(46)} gross ${money(r.gross).padStart(8)}  net ${money(r.net).padStart(8)}`);
  for (const t of c.advice) console.log(`- ${t}`);
}
process.exit(c.bestNet > 0 ? 0 : 1);
