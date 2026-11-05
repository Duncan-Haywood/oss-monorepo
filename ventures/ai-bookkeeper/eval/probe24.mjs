// Gap probe 24 (2026-11-05): descriptors in the shapes US banks print, for businesses earlier probes
// did not cover: chiropractors, locksmiths, tree services, towing operators, mobile DJs, appliance repair.
// Agent-written from public company names, not from a real export. Expected accounts were fixed
// before the first run, to the repo's conventions (supply houses 6100, software 6060, dues and
// training 6170, licences and permits 6110, insurance 6030, platform fees 6000, sales 4000).
// Usage: node eval/probe24.mjs [--misses]
import { suggest, trainClassifier } from "../categorize.mjs";
export const PROBE = [
  // chiropractors
  ["CHIROTOUCH SOFTWARE SUBSCRIPTION", "out", "6060"], ["BLUE CROSS BLUE SHIELD CLAIM PAYMENT", "in", "4000"], ["ACTIVATOR METHODS INTERNATIONAL", "out", "6170"],
  ["AMERICAN CHIROPRACTIC ASSOCIATION DUES", "out", "6170"], ["STATE BOARD OF CHIROPRACTIC EXAMINERS RENEWAL", "out", "6110"], ["BIOFREEZE SUPPLIES", "out", "6100"],
  // locksmiths
  ["KABA ILCO KEY BLANKS", "out", "6100"], ["LOCKSMITH LEDGER SOFTWARE", "out", "6060"], ["HILLMAN FASTENERS KEYS", "out", "6100"],
  ["ASSOCIATED LOCKSMITHS OF AMERICA DUES", "out", "6170"], ["LOCKSMITH LICENSE RENEWAL STATE", "out", "6110"],
  // tree services
  ["STIHL CHAINSAW DEALER", "out", "6100"], ["ARBORIST SOFTWARE SUBSCRIPTION", "out", "6060"], ["INTERNATIONAL SOCIETY OF ARBORICULTURE", "out", "6170"],
  ["TREE SERVICE WORKERS COMP INSURANCE", "out", "6030"], ["WOOD CHIPPER RENTAL SUNBELT", "out", "6090"],
  // towing operators
  ["AUTOCLUB TOWING DISPATCH PAYMENT", "in", "4000"], ["MILLER INDUSTRIES WRECKER PARTS", "out", "6100"], ["TOWBOOK SOFTWARE", "out", "6060"],
  ["TOWING AND RECOVERY ASSOCIATION DUES", "out", "6170"], ["TOW TRUCK COMMERCIAL AUTO INSURANCE", "out", "6030"],
  // mobile DJs
  ["GIGSALAD BOOKING FEE", "out", "6000"], ["SERATO DJ SUBSCRIPTION", "out", "6060"], ["GUITAR CENTER SPEAKER CABLES", "out", "6100"],
  ["ASCAP LICENSE", "out", "6110"], ["THE KNOT WORLDWIDE VENDOR FEE", "out", "6000"],
  // appliance repair
  ["MARCONE APPLIANCE PARTS", "out", "6100"], ["REPAIR CLINIC PARTS ORDER", "out", "6100"], ["HOME DEPOT PRO APPLIANCE", "out", "6100"],
  ["HOUSECALL PRO SUBSCRIPTION", "out", "6060"], ["EPA 608 CERTIFICATION EXAM", "out", "6170"],
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
