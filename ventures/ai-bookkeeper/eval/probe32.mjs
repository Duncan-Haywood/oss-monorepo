// Gap probe 32 (2026-11-07): descriptors in the shapes US banks print, for trades earlier probes
// did not cover: tattoo artists, court reporters, locksmiths, yoga instructors, bike repair shops.
// Agent-written from public company names, not from a real export. Expected accounts were fixed
// before the first run, to the repo's conventions (supply houses and materials 6100, software 6060,
// dues and training 6170, licences and permits 6110, income 4000).
// Usage: node eval/probe32.mjs [--misses]
import { suggest, trainClassifier } from "../categorize.mjs";
export const PROBE = [
  // tattoo artists
  ["ALLIANCE OF PROFESSIONAL TATTOOISTS", "out", "6170"], ["TATTOO SESSION CLIENT PAYMENT", "in", "4000"], ["EIKON DEVICE TATTOO SUPPLIES", "out", "6100"],
  ["INKBOX BOOKING APP SUBSCRIPTION", "out", "6060"], ["BODY ART PRACTITIONER PERMIT", "out", "6110"],
  // court reporters
  ["NATIONAL COURT REPORTERS ASSOCIATION", "out", "6170"], ["DEPOSITION TRANSCRIPT CLIENT PAYMENT", "in", "4000"], ["CASECATALYST SOFTWARE", "out", "6060"],
  ["STENOGRAPH PAPER AND SUPPLIES", "out", "6100"], ["COURT REPORTER LICENSE RENEWAL", "out", "6110"],
  // locksmiths
  ["ASSOCIATED LOCKSMITHS OF AMERICA", "out", "6170"], ["LOCKOUT SERVICE CUSTOMER PAYMENT", "in", "4000"], ["ULTIMATE LOCKSMITH SUPPLY KEY BLANKS", "out", "6100"],
  ["HOUSECALL PRO SUBSCRIPTION", "out", "6060"], ["LOCKSMITH LICENSE FEE", "out", "6110"],
  // yoga instructors
  ["YOGA ALLIANCE REGISTRATION", "out", "6170"], ["YOGA CLASS STUDENT PAYMENT", "in", "4000"], ["MANDUKA YOGA MATS", "out", "6100"],
  ["MINDBODY SUBSCRIPTION", "out", "6060"], ["YOGA TEACHER TRAINING WORKSHOP", "out", "6170"],
  // bike repair
  ["BICYCLE RETAILERS ASSOCIATION DUES", "out", "6170"], ["BIKE TUNE UP CUSTOMER PAYMENT", "in", "4000"], ["QUALITY BICYCLE PRODUCTS", "out", "6100"],
  ["PARK TOOL COMPANY", "out", "6100"], ["BIKE SHOP POS SOFTWARE SUBSCRIPTION", "out", "6060"],
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

