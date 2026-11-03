// Gap probe 21 (2026-11-02): descriptors in the shapes US banks print, for businesses earlier probes
// did not cover: carpet cleaners, appliance repairers, septic pumpers, welders, driving schools.
// Agent-written from public company names, not from a real export. Expected accounts were fixed
// before the first run, to the repo's conventions (supply houses 6100, software 6060, dues and
// training 6170, licences and permits 6110, insurance 6030, platform fees 6000, income 4000, rent 6080).
// Usage: node eval/probe21.mjs [--misses]
import { suggest, trainClassifier } from "../categorize.mjs";
export const PROBE = [
  // carpet cleaners
  ["JON-DON CARPET CLEANING SUPPLY", "out", "6100"], ["PROCHEM EXTRACTOR PARTS", "out", "6100"], ["IICRC CERTIFICATION RENEWAL", "out", "6170"],
  ["CARPET CLEANING ASSOCIATION DUES", "out", "6170"], ["JOBBER SOFTWARE", "out", "6060"],
  // appliance repair
  ["MARCONE APPLIANCE PARTS", "out", "6100"], ["REPAIR CLINIC PARTS", "out", "6100"], ["EPA 608 CERTIFICATION", "out", "6170"],
  ["APPLIANCE SERVICE ASSOCIATION DUES", "out", "6170"], ["SERVICE FUSION SOFTWARE", "out", "6060"],
  // septic pumpers
  ["SEPTIC PUMPING LICENSE COUNTY", "out", "6110"], ["SEPTIC DISPOSAL FEE TREATMENT PLANT", "out", "6100"],
  ["NAWT MEMBERSHIP", "out", "6170"], ["VACUUM TRUCK PARTS JUROP", "out", "6100"],
  // welders
  ["AIRGAS WELDING GAS", "out", "6100"], ["LINCOLN ELECTRIC WELDING SUPPLY", "out", "6100"], ["AWS WELDING SOCIETY CERTIFICATION", "out", "6170"],
  ["WELDING SUPPLY TRACTOR SUPPLY", "out", "6100"], ["MILLER WELDERS PARTS", "out", "6100"],
  // driving schools
  ["DRIVING SCHOOL ASSOCIATION DUES", "out", "6170"], ["DMV DRIVING SCHOOL LICENSE", "out", "6110"], ["DUAL BRAKE INSTALL", "out", "6100"],
  ["DRIVING SCHOOL INSURANCE PROGRESSIVE", "out", "6030"], ["DRIVER ED SOFTWARE", "out", "6060"],
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
