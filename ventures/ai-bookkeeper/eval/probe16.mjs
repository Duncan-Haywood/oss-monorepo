// Gap probe 16 (2026-11-01): descriptors in the shapes US banks print, for businesses earlier probes
// did not cover: drone pilots, mobile mechanics, cottage bakers, private tutors, locksmiths.
// Agent-written from public company names, not from a real export. Expected accounts were fixed
// before the first run, to the repo's conventions (supply houses 6100, software 6060, dues and
// training 6170, licences and permits 6110, insurance 6030, platform fees 6000).
// Corrections after the first run: a Part 107 exam is training (6170), not a licence fee; five lines
// were dropped as invented or ambiguous (Rainbow Auto Supply, Bakers Field, Contact School Supplies,
// Cakesafe, a bare background check).
// Usage: node eval/probe16.mjs [--misses]
import { suggest, trainClassifier } from "../categorize.mjs";
export const PROBE = [
  // drone pilots
  ["DJI STORE ORDER", "out", "6100"], ["AIRDATA UAV", "out", "6060"], ["DRONEDEPLOY SUBSCRIPTION", "out", "6060"],
  ["PIX4D LICENSE", "out", "6060"], ["FAA PART 107 EXAM", "out", "6170"], ["AUVSI MEMBERSHIP", "out", "6170"],
  ["SKYWARD AVIATION INSURANCE", "out", "6030"], ["DRONE PILOT GROUND SCHOOL", "out", "6170"],
  // mobile mechanics
  ["NAPA AUTO PARTS", "out", "6100"], ["ADVANCE AUTO PARTS", "out", "6100"],
  ["SNAP-ON TOOLS", "out", "6100"], ["ALLDATA REPAIR", "out", "6060"], ["MITCHELL1 SUBSCRIPTION", "out", "6060"],
  ["ASE CERTIFICATION", "out", "6170"], ["REPAIRPAL PAYOUT", "in", "4000"],
  // cottage bakers
  ["KING ARTHUR BAKING", "out", "6100"], ["WEBSTAURANT STORE", "out", "6100"], ["GLOBAL SUGAR ART", "out", "6100"],
  ["COTTAGE FOOD LICENSE", "out", "6110"], ["SERVSAFE CERTIFICATION", "out", "6170"], ["FARMERS MARKET BOOTH FEE", "out", "6110"],
 
  // private tutors
  ["WYZANT PAYOUT", "in", "4000"], ["VARSITY TUTORS PAYOUT", "in", "4000"], ["TUTORCRUNCHER", "out", "6060"],
  ["TEACHERS PAY TEACHERS", "in", "4000"], ["ZOOM VIDEO COMMUNICATIONS", "out", "6060"],
  ["NATIONAL TUTORING ASSOCIATION", "out", "6170"],
  // locksmiths
  ["ILCO KEY SUPPLY", "out", "6100"], ["HILLMAN FASTENERS", "out", "6100"], ["LOCKMASTERS INC", "out", "6100"],
  ["ASSOCIATED LOCKSMITHS OF AMERICA", "out", "6170"], ["LOCKSMITH LICENSE RENEWAL", "out", "6110"],
  ["LOCKSMITH BOND", "out", "6030"], ["LOCKSMITH LEADS ANGI", "out", "6000"], ["SERVICETITAN SUBSCRIPTION", "out", "6060"],
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
