// Gap probe 33 (2026-11-07): descriptors in the shapes US banks print, for trades earlier probes
// did not cover: florists, sign shops, beekeepers, mobile mechanics, podcasters.
// Agent-written from public company names, not from a real export. Expected accounts were fixed
// before the first run, to the repo's conventions (supply houses and materials 6100, software 6060,
// equipment 6070 (the Shure line was first written as 6100 and corrected after the first run: a microphone is equipment), dues and training 6170, licences and permits 6110, income 4000).
// Usage: node eval/probe33.mjs [--misses]
import { suggest, trainClassifier } from "../categorize.mjs";
export const PROBE = [
  // florists
  ["SOCIETY OF AMERICAN FLORISTS DUES", "out", "6170"], ["WEDDING BOUQUET CLIENT PAYMENT", "in", "4000"], ["SMITHERS OASIS FLORAL FOAM", "out", "6100"],
  ["FLORAL SHOP POS SOFTWARE SUBSCRIPTION", "out", "6060"], ["FLORIST BUSINESS LICENSE FEE", "out", "6110"],
  // sign shops
  ["INTERNATIONAL SIGN ASSOCIATION", "out", "6170"], ["BANNER ORDER CUSTOMER PAYMENT", "in", "4000"], ["ORACAL VINYL ROLLS", "out", "6100"],
  ["FLEXISIGN DESIGN SOFTWARE", "out", "6060"], ["SIGN CONTRACTOR PERMIT FEE", "out", "6110"],
  // beekeepers
  ["AMERICAN BEEKEEPING FEDERATION DUES", "out", "6170"], ["HONEY JAR FARMERS MARKET SALES", "in", "4000"], ["MANN LAKE BEE SUPPLY", "out", "6100"],
  ["HIVE TRACKS APP SUBSCRIPTION", "out", "6060"], ["APIARY REGISTRATION FEE", "out", "6110"],
  // mobile mechanics
  ["AUTOMOTIVE SERVICE ASSOCIATION DUES", "out", "6170"], ["ON SITE BRAKE JOB CUSTOMER PAYMENT", "in", "4000"], ["NAPA AUTO PARTS", "out", "6100"],
  ["SHOPMONKEY SUBSCRIPTION", "out", "6060"], ["ASE CERTIFICATION EXAM FEE", "out", "6170"],
  // podcasters
  ["PODCAST MOVEMENT MEMBERSHIP", "out", "6170"], ["SPONSOR AD PAYMENT PODCAST", "in", "4000"], ["SHURE MICROPHONES", "out", "6070"],
  ["BUZZSPROUT HOSTING SUBSCRIPTION", "out", "6060"], ["RIVERSIDE FM SUBSCRIPTION", "out", "6060"],
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
