// Gap probe 37 (2026-11-10): descriptors in the shapes US banks print, for trades earlier probes did not
// cover: doulas, estheticians, snow plowers, taxidermists, vehicle-wrap installers.
// Agent-written from public company names, not from a real export. Expected accounts fixed before the
// first run, to the repo's conventions (supply houses 6100, software 6060, dues and training 6170,
// licences and permits 6110, insurance 6030, cost of goods 5000, sales 4000).
// Usage: node eval/probe37.mjs [--misses]
import { suggest, trainClassifier } from "../categorize.mjs";
export const PROBE = [
  // doulas
  ["DONA INTERNATIONAL MEMBERSHIP", "out", "6170"], ["CAPPA CERTIFICATION RENEWAL", "out", "6170"], ["BIRTH DOULA SERVICES PAYMENT", "in", "4000"],
  ["PUMP STATION AND NURSERY SUPPLIES", "out", "6100"], ["DOULA SOFTWARE SUBSCRIPTION", "out", "6060"],
  // estheticians
  ["ASSOCIATED SKIN CARE PROFESSIONALS", "out", "6170"], ["SALLY BEAUTY PRO SUPPLY", "out", "6100"], ["STATE BOARD OF COSMETOLOGY LICENSE", "out", "6110"],
  ["FACIAL TREATMENT PAYMENT", "in", "4000"], ["VAGARO SUBSCRIPTION", "out", "6060"],
  // snow plowers
  ["WESTERN PLOW PARTS", "out", "6100"], ["SNOW AND ICE MANAGEMENT ASSOCIATION DUES", "out", "6170"], ["SEASONAL SNOW PLOWING CONTRACT PAYMENT", "in", "4000"],
  ["ROCK SALT BULK ORDER", "out", "5000"], ["PLOWSITE SOFTWARE", "out", "6060"],
  // taxidermists
  ["NATIONAL TAXIDERMISTS ASSOCIATION", "out", "6170"], ["MCKENZIE TAXIDERMY SUPPLY", "out", "6100"], ["STATE WILDLIFE TAXIDERMY PERMIT", "out", "6110"],
  ["DEER MOUNT DEPOSIT", "in", "4000"], ["ANIMAL EYES AND FORMS ORDER", "out", "5000"],
  // vinyl wrap installers
  ["AVERY DENNISON GRAPHICS", "out", "5000"], ["3M COMMERCIAL GRAPHICS", "out", "5000"], ["PROFESSIONAL WRAP INSTALLERS GUILD", "out", "6170"],
  ["VEHICLE WRAP DEPOSIT", "in", "4000"], ["FLEXISIGN SOFTWARE", "out", "6060"],
];

const model = { classifier: trainClassifier([]), memory: new Map(), rules: [], codes: null };
let ok = 0, wrong = 0, none = 0; const misses = [];
for (const [desc, d, want] of PROBE) {
  const s = suggest({ desc, cents: d === "out" ? -1000 : 1000 }, model);
  const got = s.account ?? "";
  if (got === want) ok++; else { got ? wrong++ : none++; misses.push(`${got ? "WRONG" : "none "} ${desc} -> ${got || "-"} (want ${want})`); }
}
console.log(`${PROBE.length} descriptors: ${ok} right, ${wrong} wrong, ${none} no suggestion`);
if (process.argv.includes("--misses")) console.log(misses.join("\n"));
