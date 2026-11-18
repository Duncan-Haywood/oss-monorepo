// Gap probe 19 (2026-11-02): descriptors in the shapes US banks print, for businesses earlier probes
// did not cover: locksmiths, chimney sweeps, drone pilots, sign makers, mobile notaries' neighbours in trades.
// Agent-written from public company names, not from a real export. Expected accounts were fixed
// before the first run, to the repo's conventions (supply houses 6100, software 6060, dues and
// training 6170, licences and permits 6110, insurance 6030, platform fees 6000, income 4000).
// Correction after the first run: a Part 107 exam is training (6170), my expectation of 6110 was wrong, not the rule.
// Usage: node eval/probe19.mjs [--misses]
import { suggest, trainClassifier } from "../categorize.mjs";
export const PROBE = [
  // locksmiths
  ["SOUTHERN LOCK AND SUPPLY", "out", "6100"], ["ASSOCIATED LOCKSMITHS OF AMERICA", "out", "6170"], ["LOCKSMITH LICENSE RENEWAL", "out", "6110"],
  ["KABA ILCO KEY BLANKS", "out", "6100"], ["LOCKSMITH LEAD FEE", "out", "6000"],
  // chimney sweeps
  ["CHIMNEY SAFETY INSTITUTE OF AMERICA", "out", "6170"], ["CHIM CHIMNEY BRUSH SUPPLY", "out", "6100"], ["CHIMNEY SWEEP SOFTWARE", "out", "6060"],
  ["NATIONAL FIREPLACE SUPPLY", "out", "6100"], ["SWEEP LIABILITY INSURANCE", "out", "6030"],
  // drone pilots
  ["FAA PART 107 EXAM FEE", "out", "6170"], ["DRONEDEPLOY SUBSCRIPTION", "out", "6060"], ["DJI STORE BATTERIES", "out", "6100"],
  ["PIX4D", "out", "6060"], ["DRONE INSURANCE SKYWATCH", "out", "6030"],
  // sign makers
  ["ORACAL VINYL", "out", "6100"], ["SIGN WAREHOUSE", "out", "6100"], ["FLEXISIGN", "out", "6060"],
  ["INTERNATIONAL SIGN ASSOCIATION", "out", "6170"], ["CITY SIGN PERMIT", "out", "6110"],
  // brew-on-premises and craft makers
  ["MORE BEER HOMEBREW", "out", "6100"], ["BREWERS ASSOCIATION DUES", "out", "6170"], ["BREWFATHER", "out", "6060"],
  ["TTB PERMIT", "out", "6110"], ["TAPROOM SQUARE PAYOUT", "in", "4000"],
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
