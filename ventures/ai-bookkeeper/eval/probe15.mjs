// Gap probe 15 (2026-10-31): descriptors in the shapes US banks print, for businesses earlier probes
// did not cover: roofers, HVAC contractors, personal chefs, music teachers, massage therapists.
// Agent-written from public company names, not from a real export. Expected accounts were fixed
// before the first run, to the repo's conventions (supply houses 6100, software 6060, dues and
// training 6170, licences and permits 6110, insurance 6030, platform fees 6000).
// Dropped after the first run as ambiguous: Instacart (groceries or supplies), Sweetwater Sound (equipment, filed 6070 by
// an older rule) and a Venmo lesson payment.
// Usage: node eval/probe15.mjs [--misses]
import { suggest, trainClassifier } from "../categorize.mjs";
export const PROBE = [
  // roofers
  ["ABC SUPPLY ROOFING", "out", "6100"], ["BEACON ROOFING SUPPLY", "out", "6100"], ["ROOFSNAP", "out", "6060"], ["ROOFING CONTRACTOR LICENSE", "out", "6110"],
  ["NRCA MEMBERSHIP", "out", "6170"], ["WORKERS COMP PREMIUM", "out", "6030"],
  // HVAC contractors
  ["FERGUSON HVAC", "out", "6100"], ["JOHNSTONE SUPPLY", "out", "6100"], ["EPA 608 CERTIFICATION", "out", "6170"], ["SERVICETITAN", "out", "6060"],
  ["ACCA MEMBERSHIP", "out", "6170"], ["MECHANICAL PERMIT FEE", "out", "6110"],
  // personal chefs
  ["WEBSTAURANTSTORE", "out", "6100"], ["SERVSAFE CERTIFICATION", "out", "6170"], ["USPCA DUES", "out", "6170"],
  ["TOAST POS", "out", "6060"], ["CHEF LIABILITY INSURANCE", "out", "6030"],
  // music teachers
  ["SHEET MUSIC PLUS", "out", "6100"], ["MTNA MEMBERSHIP", "out", "6170"], ["MUSIC TEACHERS HELPER", "out", "6060"],
  ["STUDIO RENT", "out", "6080"],
  // massage therapists
  ["BIOTONE", "out", "6100"], ["MASSAGE WAREHOUSE", "out", "6100"], ["AMTA MEMBERSHIP", "out", "6170"], ["ABMP DUES", "out", "6170"],
  ["MASSAGE LICENSE RENEWAL", "out", "6110"], ["SQUARE APPOINTMENTS", "out", "6060"],
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
