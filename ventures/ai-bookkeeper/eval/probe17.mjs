// Gap probe 17 (2026-11-01): descriptors in the shapes US banks print, for businesses earlier probes
// did not cover: freelance editors, podcast producers, virtual assistants, farriers, bounce-house renters.
// Agent-written from public company names, not from a real export. Expected accounts were fixed
// before the first run, to the repo's conventions (supply houses 6100, software 6060, dues and
// training 6170, licences and permits 6110, insurance 6030, platform fees 6000).
// Corrections after the first run: microphones and cameras are equipment (6070) and an equipment
// rental house files under 6090, so three of my expectations were wrong, not the rules.
// Usage: node eval/probe17.mjs [--misses]
import { suggest, trainClassifier } from "../categorize.mjs";
export const PROBE = [
  // freelance editors
  ["REEDSY PAYOUT", "in", "4000"], ["PROWRITINGAID", "out", "6060"], ["GRAMMARLY BUSINESS", "out", "6060"],
  ["CHICAGO MANUAL OF STYLE ONLINE", "out", "6060"], ["EDITORIAL FREELANCERS ASSOCIATION", "out", "6170"],
  ["ACES SOCIETY OF EDITING", "out", "6170"], ["UPWORK ESCROW PAYOUT", "in", "4000"],
  // podcast producers
  ["RIVERSIDE.FM", "out", "6060"], ["DESCRIPT SUBSCRIPTION", "out", "6060"], ["BUZZSPROUT HOSTING", "out", "6060"],
  ["SHURE MICROPHONES", "out", "6070"], ["B&H PHOTO VIDEO", "out", "6070"], ["EPIDEMIC SOUND", "out", "6060"],
  ["PODCAST MOVEMENT MEMBERSHIP", "out", "6170"],
  // virtual assistants
  ["ASANA PREMIUM", "out", "6060"], ["CALENDLY PRO", "out", "6060"], ["LASTPASS BUSINESS", "out", "6060"],
  ["INTERNATIONAL VIRTUAL ASSISTANTS ASSOCIATION", "out", "6170"], ["FANCY HANDS PAYOUT", "in", "4000"],
  ["TIME ETC PAYOUT", "in", "4000"],
  // farriers
  ["FARRIERS SUPPLY CO", "out", "6100"], ["MUSTAD HOOF NAILS", "out", "6100"], ["VULCAN FORGE PROPANE", "out", "6140"],
  ["AMERICAN FARRIERS ASSOCIATION", "out", "6170"], ["TRACTOR SUPPLY", "out", "6100"],
  ["FARRIER LIABILITY INSURANCE", "out", "6030"],
  // bounce-house renters
  ["PARTY CRAFT INFLATABLES", "out", "6100"], ["BOUNCE HOUSE SUPPLY", "out", "6100"], ["SUNBELT RENTALS", "out", "6090"],
  ["SIGNNOW", "out", "6060"], ["EVENT RENTAL INSURANCE", "out", "6030"], ["SAFE INFLATABLE OPERATOR CERTIFICATION", "out", "6170"],
  ["PARTYSLATE LEAD", "out", "6000"], ["INFLATABLE AMUSEMENT PERMIT", "out", "6110"],
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
