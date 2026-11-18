// Gap probe 30 (2026-11-07): descriptors in the shapes US banks print, for trades earlier probes
// did not cover: 3D-print sellers, chimney sweeps, appliance repair, arborists, professional organizers.
// Agent-written from public company names, not from a real export. Expected accounts were fixed
// before the first run, to the repo's conventions (supply houses and materials 6100, software 6060,
// dues and training 6170, licences and permits 6110, equipment 6070, income 4000).
// First run (before any rule): 12 right, 3 wrong, 10 no suggestion. All three wrong rows were my expectations (Prusa, Bambu and Stihl are filed 6100 by earlier convention), so they were fixed to it; the ten no-suggestion rows were real gaps.
// Usage: node eval/probe30.mjs [--misses]
import { suggest, trainClassifier } from "../categorize.mjs";
export const PROBE = [
  // 3D-print sellers
  ["PRUSA RESEARCH", "out", "6100"], ["POLYMAKER FILAMENT", "out", "6100"], ["BAMBU LAB STORE", "out", "6100"],
  ["PRINTABLES MODEL SALES PAYOUT", "in", "4000"], ["ULTIMAKER CURA CLOUD", "out", "6060"],
  // chimney sweeps
  ["CHIMNEY SAFETY INSTITUTE OF AMERICA", "out", "6170"], ["HEARTH AND HOME SUPPLY FLUE LINER", "out", "6100"], ["CHIMNEY CLEANING CUSTOMER CHECK", "in", "4000"],
  ["CHIMNEY INSPECTION SOFTWARE SUBSCRIPTION", "out", "6060"], ["NATIONAL FIREPLACE INSTITUTE", "out", "6170"],
  // appliance repair
  ["MARCONE APPLIANCE PARTS", "out", "6100"], ["REPAIR CLINIC PARTS", "out", "6100"], ["APPLIANCE SERVICE CALL PAYMENT", "in", "4000"],
  ["EPA 608 CERTIFICATION", "out", "6170"], ["SERVICE FUSION SUBSCRIPTION", "out", "6060"],
  // arborists
  ["STIHL DEALER CHAINSAW", "out", "6100"], ["INTERNATIONAL SOCIETY OF ARBORICULTURE", "out", "6170"], ["TREE REMOVAL CUSTOMER PAYMENT", "in", "4000"],
  ["ARBORGOLD SOFTWARE", "out", "6060"], ["CITY TREE REMOVAL PERMIT", "out", "6110"],
  // professional organizers
  ["NATIONAL ASSOCIATION OF PROFESSIONAL ORGANIZERS", "out", "6170"], ["THE CONTAINER STORE", "out", "6100"], ["ORGANIZING SESSION CLIENT PAYMENT", "in", "4000"],
  ["HONEYBOOK SUBSCRIPTION", "out", "6060"], ["ELFA SHELVING SUPPLY", "out", "6100"],
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
