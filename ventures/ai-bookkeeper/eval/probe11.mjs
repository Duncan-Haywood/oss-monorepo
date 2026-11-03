// Gap probe 11 (2026-10-31): descriptors in the shapes US banks print, for businesses probes 1 to 10
// did not cover: pressure washers and window cleaners, handmade jewelry sellers, mobile notaries,
// sign and vinyl shops, beekeepers. Agent-written from public company names, not from a real export.
// Expected accounts were fixed before the first run, to the repo's conventions (supply houses 6100,
// software 6060, dues and training 6170, licences and permits 6110, insurance 6030, platform fees 6000).
// Two expectations of my own were wrong on the first run and corrected to the repo's conventions
// (Etsy listing fees 6010, carrier and label services 6180).
// Usage: node eval/probe11.mjs [--misses]
import { suggest, trainClassifier } from "../categorize.mjs";
export const PROBE = [
  // pressure washers and window cleaners
  ["SIMPSON PRESSURE WASHERS", "out", "6100"], ["NORTHERN TOOL EQUIPMENT", "out", "6100"], ["UNGER PROFESSIONAL", "out", "6100"],
  ["SODIUM HYPOCHLORITE SUPPLY", "out", "6100"], ["PWNA MEMBERSHIP", "out", "6170"], ["WINDOW CLEANING RESOURCE", "out", "6100"],
  ["HOUSECALL PRO", "out", "6060"], ["NEXTDOOR ADS", "out", "6000"], ["WORKIZ", "out", "6060"],
  // handmade jewelry sellers
  ["RIO GRANDE JEWELRY SUPPLY", "out", "6100"], ["FIRE MOUNTAIN GEMS", "out", "6100"], ["ETSY PAYOUT", "in", "4000"],
  ["ETSY LISTING FEE", "out", "6010"], ["SHIPPO LABEL", "out", "6180"], ["CRAFT SHOW BOOTH FEE", "out", "6110"],
  ["SHOPIFY PAYOUT", "in", "4000"], ["ORION METALS", "out", "6100"],
  // mobile notaries
  ["NATIONAL NOTARY ASSOCIATION", "out", "6170"], ["NOTARY PUBLIC BOND", "out", "6030"], ["STATE NOTARY COMMISSION RENEWAL", "out", "6110"],
  ["SNAPDOCS PAYOUT", "in", "4000"], ["NOTARYCAM", "out", "6060"], ["SIGNING SERVICE FEE ZELLE", "in", "4000"], ["NOTARY ERRORS AND OMISSIONS", "out", "6030"],
  // sign and vinyl shops
  ["ORACAL VINYL", "out", "6100"], ["GRAPHIC PRODUCTS INC", "out", "6100"], ["SIGN WAREHOUSE", "out", "6100"], ["VEVOR", "out", "6100"],
  ["FLEXISIGN", "out", "6060"], ["ISA SIGN ASSOCIATION", "out", "6170"], ["SIGN PERMIT FEE", "out", "6110"], ["ROLAND DGA", "out", "6100"],
  // beekeepers
  ["MANN LAKE", "out", "6100"], ["DADANT AND SONS", "out", "6100"], ["BETTERBEE SUPPLY", "out", "6100"], ["APIARY REGISTRATION", "out", "6110"],
  ["HONEY SALES SQUARE", "in", "4000"], ["BEE INSPECTION FEE", "out", "6110"], ["AMERICAN BEEKEEPING FEDERATION", "out", "6170"],
  ["FARM BUREAU INSURANCE", "out", "6030"], ["LOCAL FARMERS MARKET VENDOR FEE", "out", "6110"],
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
