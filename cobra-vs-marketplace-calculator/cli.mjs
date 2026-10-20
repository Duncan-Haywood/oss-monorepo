#!/usr/bin/env node
// CLI: COBRA vs marketplace plan total cost over the months you need coverage, with deadlines.
// No network. Exit 0 ok, 2 bad input.
import { RULES_AS_OF, compute, fmt } from "./engine.mjs";

const USAGE = `usage: node cli.mjs compare --cobra-premium <usd/mo> --market-premium <usd/mo> --cobra-oop-max <usd> --market-oop-max <usd>
         [--months 6] [--cobra-deductible <usd>] [--cobra-deductible-met <usd>] [--cobra-oop-met <usd>] [--cobra-coinsurance <pct you pay>]
         [--market-deductible <usd>] [--market-coinsurance <pct you pay>] [--expected-spend <usd>]
         [--coverage-ended YYYY-MM-DD] [--notice-sent YYYY-MM-DD] [--json]
--market-premium is the monthly amount after your premium tax credit, from your own healthcare.gov quote.`;

function fail(msg) { console.error(msg); process.exit(2); }
const argv = process.argv.slice(2);
const cmd = argv.shift();
const o = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith("--")) fail(`unexpected argument "${a}"\n${USAGE}`);
  const k = a.slice(2);
  if (k === "json") o[k] = true;
  else { if (argv[i + 1] === undefined) fail(`--${k} needs a value`); o[k] = argv[++i]; }
}
if (cmd !== "compare") fail(USAGE);
const r = compute({
  cobraPremium: o["cobra-premium"], marketPremium: o["market-premium"], months: o.months,
  cobraDeductible: o["cobra-deductible"], cobraDedMet: o["cobra-deductible-met"], cobraOopMet: o["cobra-oop-met"],
  cobraOopMax: o["cobra-oop-max"], cobraCoinsurancePct: o["cobra-coinsurance"],
  marketDeductible: o["market-deductible"], marketOopMax: o["market-oop-max"], marketCoinsurancePct: o["market-coinsurance"],
  expectedSpend: o["expected-spend"], lossDate: o["coverage-ended"], noticeDate: o["notice-sent"],
});
if (r.status === "error") fail(r.text);
if (r.dates && r.dates.error) fail(r.dates.error);
if (o.json) console.log(JSON.stringify(r, null, 2));
else {
  console.log(`${r.text}\n`);
  console.log("Scenario                                   COBRA total   Marketplace total   Cheaper");
  for (const s of r.scenarios) console.log(`${(s.label + " (" + fmt(s.spend) + ")").padEnd(42)} ${fmt(s.cobraTotal).padStart(11)}   ${fmt(s.marketTotal).padStart(17)}   ${s.cheaper}`);
  console.log(`\nWorst case: COBRA ${fmt(r.worstCase.cobra)}, marketplace ${fmt(r.worstCase.marketplace)}`);
  for (const n of r.notes) console.log(`- ${n}`);
  for (const w of r.warnings) console.log(`Note: ${w}`);
  if (r.dates) {
    const d = r.dates;
    console.log(`\nCOBRA election deadline ${d.electionDeadline} (60 days from ${d.electionNoticeBasis}); first premium due ${d.firstPremiumDue}`);
    console.log(`Marketplace special enrollment ends ${d.marketplaceWindowEnds}; pick a plan by ${d.marketplaceNoGapPickBy} to start ${d.marketplaceStartsIfPickedByThen}`);
  }
  console.log(`\n${RULES_AS_OF}. Not insurance or legal advice.`);
}
