// Gap probe 36 (2026-11-10): descriptors in the shapes US banks print, for trades earlier probes did not
// cover: house cleaners, window washers, HVAC installers, mobile welders, bike repair shops.
// Agent-written from public company names, not from a real export. Expected accounts fixed before the
// first run, to the repo's conventions (supply houses 6100, software 6060, dues and training 6170,
// licences and permits 6110, insurance 6030, cost of goods 5000, sales 4000).
// Usage: node eval/probe36.mjs [--misses]
import { suggest, trainClassifier } from "../categorize.mjs";
export const PROBE = [
  // house cleaners
  ["MOLLY MAID FRANCHISE SUPPLIES", "out", "6100"], ["ZENMAID SOFTWARE", "out", "6060"], ["ASSOCIATION OF RESIDENTIAL CLEANING SERVICES DUES", "out", "6170"],
  ["UNGER CLEANING TOOLS", "out", "6100"], ["HOUSE CLEANING PAYMENT", "in", "4000"],
  // window washers
  ["SORBO WINDOW CLEANING SUPPLY", "out", "6100"], ["PRESSURE WASHING RESOURCE DUES", "out", "6170"], ["JOBBER SCHEDULING", "out", "6060"],
  ["WINDOW CLEANING DEPOSIT", "in", "4000"], ["ETTORE SQUEEGEE ORDER", "out", "6100"],
  // HVAC installers
  ["JOHNSTONE SUPPLY", "out", "6100"], ["EPA 608 CERTIFICATION EXAM", "out", "6170"], ["SERVICETITAN SUBSCRIPTION", "out", "6060"],
  ["STATE HVAC CONTRACTOR LICENSE RENEWAL", "out", "6110"], ["HVAC INSTALL DEPOSIT", "in", "4000"],
  // mobile welders
  ["AIRGAS WELDING GASES", "out", "6100"], ["AMERICAN WELDING SOCIETY DUES", "out", "6170"], ["LINCOLN ELECTRIC STORE", "out", "6100"],
  ["WELDING REPAIR PAYMENT", "in", "4000"], ["CITY HOT WORK PERMIT", "out", "6110"],
  // bike repair shops
  ["QBP WHOLESALE", "out", "5000"], ["PARK TOOL COMPANY", "out", "6100"], ["LIGHTSPEED RETAIL POS", "out", "6060"],
  ["BICYCLE RETAILERS ASSOCIATION DUES", "out", "6170"], ["BIKE TUNE UP PAYMENT", "in", "4000"],
];
const model = { classifier: trainClassifier([]), memory: new Map(), rules: [], codes: null };
let ok = 0, wrong = 0, none = 0; const misses = [];
for (const [desc, d, want] of PROBE) {
  const s = suggest({ desc, cents: d === "out" ? -1000 : 1000 }, model);
  const got = s.account ?? "";
  if (got === want) ok++; else { got ? wrong++ : none++; misses.push(`${got ? "WRONG" : "none "} ${desc} -> ${got || "-"} (want ${want})`); }
}
console.log(`${PROBE.length} descriptors: ${ok} right, ${wrong} wrong, ${none} no suggestion`);
if (process.argv.includes("--misses")) console.log(misses.join("\n"));
