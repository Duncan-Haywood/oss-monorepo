// Gap probe 39 (2026-11-10): descriptors in the shapes US banks print, for trades earlier probes did not
// cover: pool service techs, personal trainers, wedding DJs, upholsterers, farriers.
// Agent-written from public company names, not from a real export. Expected accounts fixed before the
// first run, to the repo's conventions (supply houses 6100, software 6060, dues and training 6170,
// licences and permits 6110, insurance 6030, cost of goods 5000, sales 4000).
// Usage: node eval/probe39.mjs [--misses]
import { suggest, trainClassifier } from "../categorize.mjs";
export const PROBE = [
  // pool service
  ["POOL AND SPA ALLIANCE DUES", "out", "6170"], ["SKIMMER POOL ROUTE SOFTWARE", "out", "6060"],
  ["POOL CLEANING PAYMENT", "in", "4000"],
  // personal trainers
  ["NATIONAL STRENGTH TRAINERS ASSOCIATION DUES", "out", "6170"], ["TRAINERIZE COACHING SOFTWARE", "out", "6060"], ["CPR AED CERTIFICATION CLASS", "out", "6170"],
  ["RESISTANCE BAND WHOLESALE", "out", "6100"], ["PERSONAL TRAINING SESSION PAYMENT", "in", "4000"],
  // wedding DJs
  ["AMERICAN DISC JOCKEY ASSOCIATION DUES", "out", "6170"], ["DJ MUSIC POOL SUBSCRIPTION", "out", "6060"], ["SERATO DJ SOFTWARE", "out", "6060"],
  ["WEDDING DJ DEPOSIT", "in", "4000"], ["CITY ENTERTAINMENT PERMIT FEE", "out", "6110"],
  // upholsterers
  ["UPHOLSTERERS INTERNATIONAL ASSOCIATION DUES", "out", "6170"], ["FOAM FACTORY FOAM ORDER", "out", "5000"], ["UPHOLSTERY SUPPLY HOUSE", "out", "6100"],
  ["SOFA RECOVERING DEPOSIT", "in", "4000"], ["UPHOLSTERY SHOP LICENSE RENEWAL", "out", "6110"],
  // farriers
  ["AMERICAN FARRIERS ASSOCIATION DUES", "out", "6170"], ["FARRIER BUSINESS SOFTWARE", "out", "6060"],
  ["HORSE SHOEING PAYMENT", "in", "4000"],
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
