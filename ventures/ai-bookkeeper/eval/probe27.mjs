// Gap probe 27 (2026-11-05): descriptors in the shapes US banks print, for trades earlier probes
// did not cover: locksmiths, piano tuners, chimney sweeps, mobile welders, home stagers.
// Agent-written from public company names, not from a real export. Expected accounts were fixed
// before the first run, to the repo's conventions (supply houses and parts 6100, software 6060,
// dues and training 6170, licences and permits 6110, insurance 6030, platform fees 6000, income 4000,
// equipment 6070).
// First run: 8 right, 3 wrong, 14 no suggestion. Three expectations were mine to fix: Lincoln Electric and Ilco are 6100 (supply houses, as probe 5 settled), not equipment. One wrong was a real bug: Miller Electric filed as utilities.
// Usage: node eval/probe27.mjs [--misses]
import { suggest, trainClassifier } from "../categorize.mjs";
export const PROBE = [
  // locksmiths
  ["HILLMAN GROUP KEY BLANKS", "out", "6100"], ["ASSOCIATED LOCKSMITHS OF AMERICA", "out", "6170"], ["LOCKSMITH LICENSE BOARD", "out", "6110"],
  ["LOCKSMITH LOCKOUT SERVICE CALL", "in", "4000"], ["ILCO KEY MACHINE", "out", "6100"],
  // piano tuners
  ["PIANO TECHNICIANS GUILD", "out", "6170"], ["SCHAFF PIANO SUPPLY", "out", "6100"], ["TUNING SERVICE PIANO", "in", "4000"],
  ["TUNELAB PRO", "out", "6060"], ["STEINWAY HALL REGULATION FEE", "in", "4000"],
  // chimney sweeps
  ["CHIMNEY SAFETY INSTITUTE OF AMERICA", "out", "6170"], ["CHIMNEY INSPECTION CLIENT PAYMENT", "in", "4000"], ["ROTOBRUSH", "out", "6100"],
  ["NATIONAL CHIMNEY SUPPLY", "out", "6100"], ["HEARTH PATIO BARBECUE ASSOCIATION", "out", "6170"],
  // mobile welders
  ["LINCOLN ELECTRIC WELDER", "out", "6100"], ["AIRGAS WELDING GAS", "out", "6100"], ["AMERICAN WELDING SOCIETY", "out", "6170"],
  ["MOBILE WELD REPAIR", "in", "4000"], ["MILLER ELECTRIC", "out", "6100"],
  // home stagers
  ["ROOMS TO GO RENTAL FURNITURE", "out", "6100"], ["REAL ESTATE STAGING ASSOCIATION", "out", "6170"], ["STAGING FEE CLIENT", "in", "4000"],
  ["CORT FURNITURE RENTAL", "out", "6100"], ["ROOMSKETCHER SUBSCRIPTION", "out", "6060"],
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
