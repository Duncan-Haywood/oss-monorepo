// Gap probe 22 (2026-11-03): descriptors in the shapes US banks print, for businesses earlier probes
// did not cover: mobile notaries, piano tuners, florists, tattoo artists, pool installers.
// Agent-written from public company names, not from a real export. Expected accounts were fixed
// before the first run, to the repo's conventions (supply houses 6100, software 6060, dues and
// training 6170, licences and permits 6110, insurance 6030, platform fees 6000, rent 6080).
// Usage: node eval/probe22.mjs [--misses]
import { suggest, trainClassifier } from "../categorize.mjs";
export const PROBE = [
  // mobile notaries
  ["NATIONAL NOTARY ASSOCIATION DUES", "out", "6170"], ["NOTARY PUBLIC STAMP AND SEAL SUPPLIES", "out", "6100"], ["NOTARY BOND AND E&O INSURANCE", "out", "6030"],
  ["SECRETARY OF STATE NOTARY COMMISSION", "out", "6110"], ["NOTARY ESSENTIALS JOURNAL", "out", "6100"], ["SIGNINGORDER SOFTWARE", "out", "6060"],
  // piano tuners
  ["PIANO TECHNICIANS GUILD DUES", "out", "6170"], ["SCHAFF PIANO SUPPLY", "out", "6100"], ["PIANO TUNING HAMMER AND FELT", "out", "6100"],
  ["CUNNINGHAM PIANO PARTS", "out", "6100"],
  // florists
  ["TEAM FLOWER WHOLESALE", "out", "6100"], ["SOCIETY OF AMERICAN FLORISTS DUES", "out", "6170"], ["FLORAL FOAM AND RIBBON SUPPLY", "out", "6100"],
  ["FLORIST SOFTWARE FLORAL CRM", "out", "6060"],
  // tattoo artists
  ["ALLIANCE OF PROFESSIONAL TATTOOISTS", "out", "6170"], ["TATTOO SUPPLY EMPIRE NEEDLES", "out", "6100"], ["TATTOO ARTIST HEALTH DEPT LICENSE", "out", "6110"],
  ["BLOODBORNE PATHOGEN TRAINING", "out", "6170"],
  // pool installers
  ["POOL SUPPLY WORLD", "out", "6100"], ["GUNITE AND SHOTCRETE SUPPLY", "out", "6100"], ["ASSOCIATION OF POOL AND SPA PROFESSIONALS", "out", "6170"],
  ["POOL CONTRACTOR LICENSE CSLB", "out", "6110"], ["POOL BUILDER SOFTWARE", "out", "6060"],
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
