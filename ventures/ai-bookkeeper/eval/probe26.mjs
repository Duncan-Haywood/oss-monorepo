// Gap probe 26 (2026-11-05): descriptors in the shapes US banks print, for trades earlier probes
// did not cover: drone pilots, sign-language interpreters, genealogists, wedding DJs, mobile bike mechanics.
// Agent-written from public company names, not from a real export. Expected accounts were fixed
// before the first run, to the repo's conventions (supply houses 6100, software 6060, dues and
// training 6170, licences and permits 6110, insurance 6030, platform fees 6000, income 4000,
// equipment 6070).
// First run: 8 right, 2 wrong, 15 no suggestion. Fifteen got rules; one wrong was my expectation (the FAA exam is a
// certification cost, 6170 like the translation exam, not 6110); DJI store stays 6100 as probes 10 and 19 settled it (my 6070 was the error).
// Usage: node eval/probe26.mjs [--misses]
import { suggest, trainClassifier } from "../categorize.mjs";
export const PROBE = [
  // drone pilots
  ["DRONEDEPLOY SUBSCRIPTION", "out", "6060"], ["FAA PART 107 EXAM CENTER", "out", "6170"], ["SKYWARD DRONE INSURANCE", "out", "6030"],
  ["DJI STORE", "out", "6100"], ["ALTITUDE ANGEL AIRSPACE", "out", "6060"], ["AERIAL SURVEY FEE", "in", "4000"],
  // sign-language interpreters
  ["REGISTRY OF INTERPRETERS FOR THE DEAF DUES", "out", "6170"], ["VRS INTERPRETING PAYOUT", "in", "4000"],
  ["INTERPRETER CERTIFICATION EXAM FEE", "out", "6170"], ["ZOOM VIDEO", "out", "6060"],
  // genealogists
  ["ANCESTRY.COM", "out", "6060"], ["NEWSPAPERS.COM", "out", "6060"], ["ASSOCIATION OF PROFESSIONAL GENEALOGISTS", "out", "6170"],
  ["COUNTY RECORDER COPY FEE", "out", "6100"], ["RESEARCH REPORT CLIENT PAYMENT", "in", "4000"],
  // wedding DJs
  ["PIONEER DJ EQUIPMENT", "out", "6070"], ["DJ INTELLIGENCE BPM SUPREME", "out", "6060"], ["ASCAP LICENSE", "out", "6110"],
  ["THE KNOT WORLDWIDE", "out", "6000"], ["WEDDINGWIRE VENDOR FEE", "out", "6000"], ["WEDDING RECEPTION DEPOSIT", "in", "4000"],
  // mobile bike mechanics
  ["PARK TOOL COMPANY", "out", "6100"], ["QUALITY BICYCLE PRODUCTS", "out", "6100"], ["UNITED BICYCLE INSTITUTE", "out", "6170"],
  ["TUNE UP SERVICE CALL", "in", "4000"],
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
