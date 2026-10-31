// Gap probe 12 (2026-10-31): descriptors in the shapes US banks print, for businesses probes 1 to 11
// did not cover: florists, home inspectors, food trucks, freelance translators, event planners.
// Agent-written from public company names, not from a real export. Expected accounts were fixed
// before the first run, to the repo's conventions (supply houses 6100, software 6060, dues and
// training 6170, licences and permits 6110, insurance 6030, platform fees 6000).
// Usage: node eval/probe12.mjs [--misses]
import { suggest, trainClassifier } from "../categorize.mjs";
export const PROBE = [
  // florists
  ["USA BLOOM WHOLESALE", "out", "6100"], ["FLORA BUNDA", "out", "6100"], ["SMITHERS-OASIS", "out", "6100"], ["TELEFLORA", "out", "6000"],
  ["SOCIETY OF AMERICAN FLORISTS", "out", "6170"], ["FLORIST COOLER REPAIR", "out", "6090"], ["FLORAL INVOICE ZELLE", "in", "4000"],
  // home inspectors
  ["SPECTORA", "out", "6060"], ["ASHI MEMBERSHIP", "out", "6170"], ["INTERNACHI DUES", "out", "6170"], ["HOME INSPECTOR LICENSE RENEWAL", "out", "6110"],
  ["FLIR SYSTEMS", "out", "6070"], ["INSPECTION FEE ZELLE", "in", "4000"], ["ERRORS AND OMISSIONS INSURANCE", "out", "6030"], ["RADON TEST KITS", "out", "6100"],
  // food trucks
  ["RESTAURANT DEPOT", "out", "6100"], ["WEBSTAURANTSTORE", "out", "6100"], ["MOBILE FOOD VENDOR PERMIT", "out", "6110"], ["COMMISSARY KITCHEN RENT", "out", "6080"],
  ["PROPANE REFILL", "out", "6140"], ["TOAST PAYOUT", "in", "4000"], ["FESTIVAL VENDOR FEE", "out", "6110"], ["GENERATOR REPAIR", "out", "6090"],
  // translators
  ["PROZ MEMBERSHIP", "out", "6170"], ["AMERICAN TRANSLATORS ASSOCIATION", "out", "6170"], ["TRADOS", "out", "6060"], ["MEMOQ", "out", "6060"],
  ["TRANSLATION PAYOUT WISE", "in", "4000"], ["SMARTCAT", "out", "6060"], ["DEEPL PRO", "out", "6060"],
  // event planners
  ["EVENTBRITE PAYOUT", "in", "4000"], ["HONEYBOOK", "out", "6060"], ["ZOLA", "out", "6000"],
  ["ASSOCIATION OF BRIDAL CONSULTANTS", "out", "6170"],
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
