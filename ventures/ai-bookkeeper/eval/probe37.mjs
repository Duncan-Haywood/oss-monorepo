// Gap probe 37 (2026-11-10): descriptors in the shapes US banks print, for trades earlier probes did not
// cover: locksmiths, florists, tattoo artists, massage therapists, mobile phone repair shops.
// Agent-written from public company names, not from a real export. Expected accounts fixed before the
// first run, to the repo's conventions (supply houses 6100, software 6060, dues and training 6170,
// licences and permits 6110, insurance 6030, cost of goods 5000, sales 4000).
// Usage: node eval/probe37.mjs [--misses]
import { suggest, trainClassifier } from "../categorize.mjs";
export const PROBE = [
  // locksmiths
  ["ASSOCIATED LOCKSMITHS OF AMERICA DUES", "out", "6170"], ["HILLMAN KEY BLANKS", "out", "5000"], ["LOCKSMITH DISPATCH SOFTWARE", "out", "6060"],
  ["STATE LOCKSMITH LICENSE RENEWAL", "out", "6110"], ["LOCKOUT SERVICE PAYMENT", "in", "4000"],
  // florists
  ["SOCIETY OF AMERICAN FLORISTS DUES", "out", "6170"], ["FLORAL POS SUBSCRIPTION", "out", "6060"],
  ["WEDDING FLOWERS DEPOSIT", "in", "4000"],
  // tattoo artists
  ["ALLIANCE OF PROFESSIONAL TATTOOISTS DUES", "out", "6170"], ["BLOODBORNE PATHOGENS TRAINING", "out", "6170"], ["TATTOO SUPPLY WHOLESALE", "out", "6100"],
  ["COUNTY TATTOO ARTIST PERMIT", "out", "6110"], ["TATTOO SESSION DEPOSIT", "in", "4000"],
  // massage therapists
  ["ASSOCIATED BODYWORK AND MASSAGE PROFESSIONALS", "out", "6170"], ["MASSAGE BOOK SCHEDULING", "out", "6060"], ["BIOTONE MASSAGE OIL", "out", "6100"],
  ["STATE MASSAGE THERAPY LICENSE", "out", "6110"], ["MASSAGE SESSION PAYMENT", "in", "4000"],
  // phone repair shops
  ["MOBILESENTRIX PARTS", "out", "5000"], ["REPAIRDESK SOFTWARE", "out", "6060"], ["IFIXIT PRO TECH TOOLKIT", "out", "6100"],
  ["SCREEN REPLACEMENT PAYMENT", "in", "4000"], ["REPAIR ASSOCIATION DUES", "out", "6170"],
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
