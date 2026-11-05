// Gap probe 24 (2026-11-05): descriptors in the shapes US banks print, for businesses earlier probes
// did not cover: translators, beekeepers, potters, court reporters and podcasters.
// Agent-written from public company names, not from a real export. Expected accounts were fixed
// before the first run, to the repo's conventions (supply houses 6100, software 6060, dues and
// training 6170, licences and permits 6110, insurance 6030, platform fees 6000, income 4000).
// Correction after the first run: rent is 6080 (I wrote 6040, interest expense), my expectation was wrong, not the rule.
// First run: 16 right, 2 wrong, 7 no suggestion; the seven no-suggestion rows got rules; Shure microphones stay 6070 as probe 17 fixed them (my 6100 was the error) in categorize.mjs.
// Usage: node eval/probe24.mjs [--misses]
import { suggest, trainClassifier } from "../categorize.mjs";
export const PROBE = [
  // translators
  ["SDL TRADOS STUDIO", "out", "6060"], ["AMERICAN TRANSLATORS ASSOCIATION DUES", "out", "6170"], ["PROZ.COM MEMBERSHIP", "out", "6000"],
  ["MEMOQ TRANSLATOR PRO", "out", "6060"], ["CERTIFIED TRANSLATION EXAM ATA", "out", "6170"],
  // beekeepers
  ["MANN LAKE BEE SUPPLY", "out", "6100"], ["BETTERBEE EQUIPMENT", "out", "6100"], ["STATE APIARY REGISTRATION", "out", "6110"],
  ["AMERICAN BEEKEEPING FEDERATION DUES", "out", "6170"], ["FARMERS MARKET HONEY BOOTH FEE", "out", "6000"],
  // potters
  ["LAGUNA CLAY COMPANY", "out", "6100"], ["AMACO GLAZES", "out", "6100"], ["SKUTT KILNS", "out", "6100"],
  ["CLAYSHARE STUDIO RENT", "out", "6080"], ["ETSY PAYOUT", "in", "4000"],
  // court reporters
  ["NATIONAL COURT REPORTERS ASSOCIATION", "out", "6170"], ["CASECATALYST SOFTWARE", "out", "6060"], ["STENOGRAPH PAPER SUPPLY", "out", "6100"],
  ["COURT REPORTER LICENSE RENEWAL", "out", "6110"], ["DEPOSITION TRANSCRIPT FEE", "in", "4000"],
  // podcasters
  ["BUZZSPROUT HOSTING", "out", "6060"], ["RIVERSIDE.FM", "out", "6060"], ["SHURE MICROPHONES", "out", "6070"],
  ["PODCAST MOVEMENT CONFERENCE", "out", "6170"], ["SPONSORSHIP PAYMENT ACAST", "in", "4000"],
];
const model = { classifier: trainClassifier([]), memory: new Map(), rules: [], codes: null };
let ok = 0, wrong = 0, none = 0; const misses = [];
for (const [desc, d, want] of PROBE) {
  const s = suggest({ desc, cents: d === "out" ? -1000 : 1000 }, model);
  const got = s.account ?? "";
  if (got === want) ok++; else { got ? wrong++ : none++; misses.push(`${got ? "WRONG" : "none "} ${desc} -> ${got || "-"} (want ${want || "none"})`); }
}
console.log(`${PROBE.length} descriptors: ${ok} right, ${wrong} wrong, ${none} no suggestion`);
if (process.argv.includes("--misses")) console.log(misses.join("\n"));
