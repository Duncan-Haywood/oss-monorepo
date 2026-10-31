// Gap probe 13 (2026-10-31): descriptors in the shapes US banks print, for businesses probes 1 to 11
// did not cover: florists, house painters, handymen, freelance translators, process servers.
// Agent-written from public company names, not from a real export. Expected accounts were fixed
// before the first run, to the repo's conventions (supply houses 6100, software 6060, dues and
// training 6170, licences and permits 6110, insurance 6030, platform fees 6000, carriers 6180).
// Three expectations of my own were dropped or corrected on the first run (a Wise transfer is a
// transfer, a chiller repair has no account in the chart, payroll is wages 6150).
// Usage: node eval/probe13.mjs [--misses]
import { suggest, trainClassifier } from "../categorize.mjs";
export const PROBE = [
  // florists
  ["SYSCO FLORAL WHOLESALE", "out", "6100"], ["USA BOUQUET", "out", "6100"], ["FLORAL SUPPLYSYNDICATE", "out", "6100"],
  ["SMITHERS OASIS", "out", "6100"], ["TELEFLORA ORDER", "in", "4000"], ["FTD ORDER PAYOUT", "in", "4000"],
  ["SOCIETY OF AMERICAN FLORISTS", "out", "6170"], ["FLORIST WIRE SERVICE FEE", "out", "6000"],
  // house painters
  ["SHERWIN WILLIAMS", "out", "6100"], ["BENJAMIN MOORE", "out", "6100"], ["FRAZEE PAINT", "out", "6100"],
  ["WAGNER SPRAYTECH", "out", "6100"], ["PAINTING CONTRACTORS ASSOCIATION", "out", "6170"], ["EPA LEAD RENOVATOR CERTIFICATION", "out", "6110"],
  ["JOBBER SOFTWARE", "out", "6060"], ["GUSTO PAYROLL", "out", "6150"],
  // handymen
  ["HOME DEPOT PRO", "out", "6100"], ["LOWES PRO SUPPLY", "out", "6100"], ["HARBOR FREIGHT TOOLS", "out", "6100"],
  ["THUMBTACK LEAD FEE", "out", "6000"], ["ANGI LEADS", "out", "6000"], ["TASKRABBIT PAYOUT", "in", "4000"],
  ["HANDYMAN CONTRACTOR LICENSE RENEWAL", "out", "6110"], ["GENERAL LIABILITY INSURANCE HISCOX", "out", "6030"],
  // freelance translators
  ["PROZ MEMBERSHIP", "out", "6170"], ["AMERICAN TRANSLATORS ASSOCIATION", "out", "6170"], ["TRADOS SUBSCRIPTION", "out", "6060"],
  ["MEMOQ LICENSE", "out", "6060"], ["DEEPL PRO", "out", "6060"], ["TRANSLATIONS COM PAYOUT", "in", "4000"],
  ["GENGO PAYMENT", "in", "4000"], ["ATA CERTIFICATION EXAM", "out", "6170"],
  // process servers and court reporters
  ["NAPPS MEMBERSHIP", "out", "6170"], ["SERVE MANAGER", "out", "6060"], ["COURT FILING FEE", "out", "6110"],
  ["PROCESS SERVER BOND", "out", "6030"], ["CERTIFIED MAIL USPS", "out", "6070"], ["NATIONAL COURT REPORTERS ASSOCIATION", "out", "6170"],
  ["ESQUIRE DEPOSITION SERVICES PAYOUT", "in", "4000"], ["STENOGRAPH SUPPLY", "out", "6100"],
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
