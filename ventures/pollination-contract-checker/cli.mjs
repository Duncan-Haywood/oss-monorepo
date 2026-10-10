#!/usr/bin/env node
// node cli.mjs --hives 400 --fee 175 [--miles 1400] [--fail 8] [--broker 5] [--loss 6] [--forgone 55] [--json]
// exit 1 when the contract loses money or leaves under 15% of the fee
import { check, money } from "./calc.mjs";

const FLAGS = { "--hives": "hives", "--fee": "feePerHive", "--miles": "miles", "--fail": "failPct", "--broker": "brokerPct", "--loss": "lossPct", "--forgone": "forgoneIncomePerHive", "--feed": "feedPerHive", "--per-mile": "truckCostPerMile", "--per-load": "hivesPerLoad", "--labor-rate": "laborRate", "--replace": "replaceCostPerHive", "--fixed": "extraFixed" };
const input = {};
let json = false;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--json") json = true;
  else if (FLAGS[args[i]]) input[FLAGS[args[i]]] = Number(args[++i]);
  else { console.error(`unknown option ${args[i]}`); process.exit(2); }
}
if (!input.hives || !input.feePerHive) { console.error("usage: node cli.mjs --hives <n> --fee <$ per hive> [--miles n] [--fail %] [--broker %] [--loss %] [--forgone $/hive] [--feed $/hive] [--per-mile $] [--per-load n] [--labor-rate $] [--replace $] [--fixed $] [--json]"); process.exit(2); }
const r = check(input);
if (r.error) { console.error(r.error); process.exit(2); }
if (json) console.log(JSON.stringify(r, null, 2));
else {
  console.log(`Gross ${money(r.gross)}  costs ${money(r.totalCost)}  net ${money(r.net)} (${money(r.netPerHive)}/hive)  break-even fee ${money(r.breakEvenFee)}`);
  for (const [k, x] of Object.entries(r.costs)) console.log(`  ${k.padEnd(14)} ${money(x).padStart(10)}`);
  for (const t of r.advice) console.log(`- ${t}`);
}
process.exit(r.loses || r.thin ? 1 : 0);
