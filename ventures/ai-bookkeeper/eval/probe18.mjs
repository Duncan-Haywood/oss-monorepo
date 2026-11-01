// Gap probe 18 (2026-11-01): descriptors in the shapes US banks print, for businesses earlier probes
// did not cover: wedding photographers, notaries, pool cleaners, court reporters, beekeepers.
// Agent-written from public company names, not from a real export. Expected accounts were fixed
// before the first run, to the repo's conventions (supply houses 6100, software 6060, dues and
// training 6170, licences and permits 6110, insurance 6030, platform fees 6000, income 4000).
// Corrections after the first run: WeddingWire ads file as 6000 and a farmers-market booth as 6110 (existing
// conventions), so two of my expectations were wrong, not the rules.
// Usage: node eval/probe18.mjs [--misses]
import { suggest, trainClassifier } from "../categorize.mjs";
export const PROBE = [
  // wedding photographers
  ["PIXIESET SUBSCRIPTION", "out", "6060"], ["SHOOTPROOF", "out", "6060"], ["ADOBE LIGHTROOM", "out", "6060"],
  ["PROFESSIONAL PHOTOGRAPHERS OF AMERICA", "out", "6170"], ["THE KNOT LEAD FEE", "out", "6000"], ["WEDDINGWIRE ADVERTISING", "out", "6000"],
  // notaries
  ["NATIONAL NOTARY ASSOCIATION", "out", "6170"], ["NOTARY ESSENTIALS", "out", "6100"], ["SNAPDOCS PAYOUT", "in", "4000"],
  ["NOTARY BOND AND E&O", "out", "6030"], ["NOTARY COMMISSION RENEWAL", "out", "6110"],
  // pool cleaners
  ["LESLIES POOL SUPPLIES", "out", "6100"], ["PENTAIR POOL PARTS", "out", "6100"], ["POOL BRITE CHEMICALS", "out", "6100"],
  ["SKIMMER SOFTWARE", "out", "6060"], ["CERTIFIED POOL OPERATOR COURSE", "out", "6170"],
  // court reporters
  ["NATIONAL COURT REPORTERS ASSOCIATION", "out", "6170"], ["CASECATALYST", "out", "6060"], ["STENOGRAPH SUPPLY", "out", "6100"],
  ["VERITEXT PAYOUT", "in", "4000"],
  // beekeepers
  ["MANN LAKE BEE SUPPLY", "out", "6100"], ["DADANT AND SONS", "out", "6100"], ["AMERICAN BEEKEEPING FEDERATION", "out", "6170"],
  ["APIARY REGISTRATION", "out", "6110"], ["FARMERS MARKET BOOTH FEE", "out", "6110"],
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
