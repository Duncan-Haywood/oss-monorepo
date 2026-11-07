// Gap probe 31 (2026-11-07): descriptors in the shapes US banks print, for trades earlier probes
// did not cover: mobile notaries, pool cleaners, piano tuners, dog trainers, home inspectors.
// Agent-written from public company names, not from a real export. Expected accounts were fixed
// before the first run, to the repo's conventions (supply houses and materials 6100, software 6060,
// dues and training 6170, licences and permits 6110, income 4000).
// Usage: node eval/probe31.mjs [--misses]
import { suggest, trainClassifier } from "../categorize.mjs";
export const PROBE = [
  // mobile notaries
  ["NATIONAL NOTARY ASSOCIATION", "out", "6170"], ["NOTARY SIGNING SERVICE CLIENT PAYMENT", "in", "4000"], ["NOTARY PUBLIC STAMP SUPPLIES", "out", "6100"],
  ["SNAPDOCS SUBSCRIPTION", "out", "6060"], ["NOTARY COMMISSION RENEWAL FEE", "out", "6110"],
  // pool cleaners
  ["LESLIES POOL SUPPLIES", "out", "6100"], ["POOL CLEANING CUSTOMER PAYMENT", "in", "4000"], ["SKIMMER SOFTWARE SUBSCRIPTION", "out", "6060"],
  ["POOL AND HOT TUB ALLIANCE", "out", "6170"], ["POOLCORP SCP DISTRIBUTORS", "out", "6100"],
  // piano tuners
  ["PIANO TECHNICIANS GUILD", "out", "6170"], ["PIANO TUNING CUSTOMER CHECK", "in", "4000"], ["SCHAFF PIANO SUPPLY", "out", "6100"],
  ["PIANO TUNING APP SUBSCRIPTION", "out", "6060"], ["TUNING LEVER AND MUTING FELT", "out", "6100"],
  // dog trainers
  ["CERTIFICATION COUNCIL FOR PROFESSIONAL DOG TRAINERS", "out", "6170"], ["DOG TRAINING CLASS CLIENT PAYMENT", "in", "4000"], ["CHEWY TREATS", "out", "6100"],
  ["PAWS TRAINING SOFTWARE", "out", "6060"], ["KAREN PRYOR CLICKER TRAINING", "out", "6170"],
  // home inspectors
  ["INTERNATIONAL ASSOCIATION OF CERTIFIED HOME INSPECTORS", "out", "6170"], ["HOME INSPECTION CLIENT PAYMENT", "in", "4000"], ["SPECTORA SUBSCRIPTION", "out", "6060"],
  ["HOME INSPECTOR LICENSE RENEWAL", "out", "6110"], ["FLIR THERMAL CAMERA", "out", "6070"],
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
