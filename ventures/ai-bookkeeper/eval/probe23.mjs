// Gap probe 23 (2026-11-04): descriptors in the shapes US banks print, for businesses earlier probes
// did not cover: drone pilots, cottage bakers, beekeepers, private tutors, yoga instructors.
// Agent-written from public company names, not from a real export. Expected accounts were fixed
// before the first run, to the repo's conventions (supply houses 6100, software 6060, dues and
// training 6170, licences and permits 6110, insurance 6030, platform fees 6000).
// Usage: node eval/probe23.mjs [--misses]
import { suggest, trainClassifier } from "../categorize.mjs";
export const PROBE = [
  // drone pilots
  ["DJI STORE BATTERY AND PROPS", "out", "6100"], ["AIRMAP AIRSPACE AUTHORIZATION", "out", "6060"], ["FAA PART 107 TESTING FEE", "out", "6170"],
  ["DRONE AVIATION LIABILITY INSURANCE", "out", "6030"], ["PIX4D MAPPING SOFTWARE", "out", "6060"], ["DRONEDEPLOY SUBSCRIPTION", "out", "6060"],
  // cottage bakers
  ["COTTAGE FOOD PERMIT COUNTY HEALTH", "out", "6110"], ["KING ARTHUR BAKING FLOUR", "out", "6100"], ["WEBSTAURANT STORE BAKING PANS", "out", "6100"],
  ["SERVSAFE FOOD HANDLER CERTIFICATE", "out", "6170"], ["BAKERY PACKAGING BOXES ULINE", "out", "6100"],
  // beekeepers
  ["BETTERBEE BEEKEEPING SUPPLIES", "out", "6100"], ["MANN LAKE BEE SUPPLY", "out", "6100"], ["STATE APIARY REGISTRATION FEE", "out", "6110"],
  ["AMERICAN BEEKEEPING FEDERATION DUES", "out", "6170"], ["HONEY JARS AND LABELS", "out", "6100"],
  // private tutors
  ["WYZANT TUTOR FEE", "out", "6000"], ["ZOOM VIDEO COMMUNICATIONS", "out", "6060"], ["TEACHERS PAY TEACHERS PURCHASE", "out", "6100"],
  ["TUTOR LIABILITY INSURANCE", "out", "6030"], ["NATIONAL TUTORING ASSOCIATION DUES", "out", "6170"],
  // yoga instructors
  ["YOGA ALLIANCE REGISTRATION", "out", "6170"], ["MINDBODY STUDIO SOFTWARE", "out", "6060"], ["MANDUKA YOGA MATS", "out", "6100"],
  ["STUDIO RENT YOGA ROOM", "out", "6080"], ["YOGA INSTRUCTOR LIABILITY INSURANCE", "out", "6030"],
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
