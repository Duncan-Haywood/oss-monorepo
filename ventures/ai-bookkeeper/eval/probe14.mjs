// Gap probe 14 (2026-10-31): descriptors in the shapes US banks print, for businesses earlier probes
// did not cover: house cleaners, landscapers, yoga instructors, potters, dog trainers.
// Agent-written from public company names, not from a real export. Expected accounts were fixed
// before the first run, to the repo's conventions (supply houses 6100, software 6060, dues and
// training 6170, licences and permits 6110, insurance 6030, platform fees 6000).
// Dropped after the first run as ambiguous: mulch delivery, a bare equipment repair, and three deposit
// lines (studio sale, puppy class, day training), which could be sales or customer deposits.
// Usage: node eval/probe14.mjs [--misses]
import { suggest, trainClassifier } from "../categorize.mjs";
export const PROBE = [
  // house cleaners
  ["MAID PRO SUPPLY", "out", "6100"], ["JANITORIAL DEPOT OF AMERICA", "out", "6100"], ["ZENMAID", "out", "6060"], ["BOOKING KOALA", "out", "6060"],
  ["ARS CLEANING ASSOCIATION", "out", "6170"], ["BONDED CLEANERS INSURANCE", "out", "6030"], ["THUMBTACK LEAD", "out", "6000"],
  // landscapers
  ["SITEONE LANDSCAPE SUPPLY", "out", "6100"], ["JOHN DEERE LANDSCAPES", "out", "6100"], ["LMN SOFTWARE", "out", "6060"], ["JOBBER", "out", "6060"],
  ["PESTICIDE APPLICATOR LICENSE", "out", "6110"], ["NALP MEMBERSHIP", "out", "6170"],
  // yoga instructors
  ["MINDBODY", "out", "6060"], ["YOGA ALLIANCE REGISTRATION", "out", "6170"], ["MANDUKA", "out", "6100"], ["STUDIO RENT", "out", "6080"],
  ["CLASSPASS PAYOUT", "in", "4000"], ["ZOOM", "out", "6060"], ["MUSIC LICENSE SOUNDEXCHANGE", "out", "6110"],
  // potters
  ["AMACO", "out", "6100"], ["CLAYWORLD", "out", "6100"], ["KILN REPAIR", "out", "6090"], ["SHOPIFY", "out", "6060"], ["ARTS FESTIVAL BOOTH FEE", "out", "6110"],
  // dog trainers
  ["CCPDT RECERTIFICATION", "out", "6170"], ["KAREN PRYOR ACADEMY", "out", "6170"], ["CHEWY", "out", "6100"], ["TRAINER LIABILITY INSURANCE", "out", "6030"],
  ["TIME TO PET", "out", "6060"],
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
