// Gap probe 20 (2026-11-02): descriptors in the shapes US banks print, for businesses earlier probes
// did not cover: acupuncturists, chiropractors, tailors, window cleaners, junk haulers.
// Agent-written from public company names, not from a real export. Expected accounts were fixed
// before the first run, to the repo's conventions (supply houses 6100, software 6060, dues and
// training 6170, licences and permits 6110, insurance 6030, platform fees 6000, income 4000, rent 6080).
// Correction after the first run: 6140 is utilities, so my expectation of 6140 for landfill fees was wrong; they stay in supplies (6100), which the existing rule already gives.
// Usage: node eval/probe20.mjs [--misses]
import { suggest, trainClassifier } from "../categorize.mjs";
export const PROBE = [
  // acupuncturists
  ["LHASA OMS HERBS", "out", "6100"], ["SEIRIN NEEDLES", "out", "6100"], ["NCCAOM RECERTIFICATION", "out", "6170"],
  ["AMERICAN SOCIETY OF ACUPUNCTURISTS", "out", "6170"], ["ACUPUNCTURE LICENSE RENEWAL", "out", "6110"], ["CLEAN NEEDLE TECHNIQUE COURSE", "out", "6170"],
  // chiropractors
  ["ACATOday ACA DUES", "out", "6170"], ["CHIROTOUCH SOFTWARE", "out", "6060"], ["CHIROPRACTIC BOARD LICENSE", "out", "6110"],
  ["ZENITH TABLES SUPPLY", "out", "6100"], ["ACTIVATOR METHODS", "out", "6170"], ["CHIROPRACTORS MALPRACTICE INSURANCE NCMIC", "out", "6030"],
  // tailors and alterations
  ["JO-ANN FABRICS", "out", "6100"], ["MOOD FABRICS", "out", "6100"], ["SINGER SEWING SUPPLY", "out", "6100"],
  ["TAILOR SOFTWARE ALTERATIONS", "out", "6060"], ["PROFESSIONAL ASSOCIATION OF CUSTOM CLOTHIERS", "out", "6170"],
  // window cleaners
  ["UNGER PROFESSIONAL", "out", "6100"], ["SQUEEGEE SUPPLY ETTORE", "out", "6100"], ["PWRA WINDOW CLEANING ASSOCIATION", "out", "6170"],
  ["WATER FED POLE CARBON", "out", "6100"], ["HOUSECALL PRO", "out", "6060"],
  // junk haulers
  ["DUMP FEE LANDFILL", "out", "6100"], ["WASTE MANAGEMENT TRANSFER STATION", "out", "6100"], ["1-800-GOT-JUNK LEAD", "out", "6000"],
  ["DUMP TRAILER RENTAL", "out", "6080"], ["JUNK HAULERS LICENSE COUNTY", "out", "6110"],
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
