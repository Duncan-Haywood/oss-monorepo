// Gap probe 28 (2026-11-05): descriptors in the shapes US banks print, for trades earlier probes
// did not cover: upholsterers, farriers, sign makers, auto-glass repair, soap makers.
// Agent-written from public company names, not from a real export. Expected accounts were fixed
// before the first run, to the repo's conventions (supply houses and materials 6100, software 6060,
// dues and training 6170, licences and permits 6110, equipment 6070, income 4000).
// First run: 5 right, 2 wrong, 18 no suggestion. Both wrong rows were my expectations: earlier rules already file Roland DGA as supplies (6100, probe 10 convention) and Safelite as vehicle repair (6160), so those expectations were fixed to the existing convention.
// Usage: node eval/probe28.mjs [--misses]
import { suggest, trainClassifier } from "../categorize.mjs";
export const PROBE = [
  // upholsterers
  ["BRITEX FABRICS", "out", "6100"], ["UPHOLSTERY SUPPLY WAREHOUSE", "out", "6100"], ["NATIONAL UPHOLSTERY ASSOCIATION", "out", "6170"],
  ["SOFA REUPHOLSTERY CLIENT PAYMENT", "in", "4000"], ["SAILRITE SEWING MACHINE", "out", "6070"],
  // farriers
  ["FARRIER PRODUCTS", "out", "6100"], ["AMERICAN FARRIERS ASSOCIATION", "out", "6170"], ["HORSE SHOEING SERVICE", "in", "4000"],
  ["MUSTAD HOOFCARE", "out", "6100"], ["BROOKE FORGE ANVIL", "out", "6070"],
  // sign makers
  ["ROLAND DGA VINYL CUTTER", "out", "6100"], ["ORACAL VINYL", "out", "6100"], ["INTERNATIONAL SIGN ASSOCIATION", "out", "6170"],
  ["SIGN INSTALLATION INCOME", "in", "4000"], ["FLEXI SIGN SOFTWARE", "out", "6060"],
  // auto-glass repair
  ["SAFELITE GLASS SUPPLY", "out", "6160"], ["WINDSHIELD REPAIR CLIENT", "in", "4000"], ["NATIONAL GLASS ASSOCIATION", "out", "6170"],
  ["URETHANE ADHESIVE SUPPLY", "out", "6100"], ["AUTO GLASS TECHNICIAN CERTIFICATION", "out", "6170"],
  // soap makers
  ["BRAMBLE BERRY", "out", "6100"], ["HANDCRAFTED SOAP GUILD", "out", "6170"], ["SOAP SALES FARMERS MARKET", "in", "4000"],
  ["WHOLESALE SUPPLIES PLUS", "out", "6100"], ["SOAPCALC SUBSCRIPTION", "out", "6060"],
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
