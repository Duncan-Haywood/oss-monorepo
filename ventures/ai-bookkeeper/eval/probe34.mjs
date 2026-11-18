// Gap probe 34 (2026-11-10): descriptors in the shapes US banks print, for businesses earlier probes
// did not cover: court-record researchers, ordained wedding officiants, home stagers, food-truck
// operators, mobile car detailers, stone and tile fabricators. Agent-written from public company
// names, not from a real export. Expected accounts fixed before the first run, to the repo's
// conventions (supply houses 6100, software 6060, dues and training 6170, licences and permits 6110,
// insurance 6030, platform fees 6000, rent 6080, cost of goods 5000, sales 4000).
// Three expectations of the first draft were wrong and are fixed here, not in the rules: 6080 is rent
// (not 6070), and Restaurant Depot, U-Haul and propane depend on the trade, so they are left out.
// Usage: node eval/probe34.mjs [--misses]
import { suggest, trainClassifier } from "../categorize.mjs";
export const PROBE = [
  // court-record researchers
  ["PACER SERVICE CENTER", "out", "6060"], ["LEXISNEXIS RISK SOLUTIONS", "out", "6060"], ["TRACERS INFORMATION SPECIALISTS", "out", "6060"],
  ["COUNTY CLERK RECORDS COPY FEE", "out", "6110"], ["NATIONAL ASSOCIATION OF LEGAL SEARCHERS DUES", "out", "6170"],
  // wedding officiants
  ["AMERICAN MARRIAGE MINISTRIES", "out", "6110"], ["UNIVERSAL LIFE CHURCH SUPPLIES", "out", "6100"], ["THE KNOT WORLDWIDE VENDOR FEE", "out", "6000"],
  ["WEDDINGWIRE ADVERTISING", "out", "6000"], ["HONEYBOOK SUBSCRIPTION", "out", "6060"],
  // home stagers
  ["WAYFAIR FURNITURE", "out", "6100"], ["HOMEGOODS DECOR", "out", "6100"], ["STAGED HOME RENTAL FURNITURE CORT", "out", "6080"],
  ["REALTOR STAGING PAYMENT", "in", "4000"], ["REAL ESTATE STAGING PROFESSIONALS DUES", "out", "6170"],
  // food-truck operators
  
  ["HEALTH DEPARTMENT MOBILE FOOD PERMIT", "out", "6110"], ["ROAMING HUNGER BOOKING FEE", "out", "6000"], ["COMMISSARY KITCHEN RENT", "out", "6080"],
  // mobile car detailers
  ["MEGUIARS PRO CHEMICALS", "out", "6100"], ["CHEMICAL GUYS SUPPLIES", "out", "6100"], ["DETAILING SOFTWARE DETAILERS APP", "out", "6060"],
  ["INTERNATIONAL DETAILING ASSOCIATION DUES", "out", "6170"], ["KARCHER PRESSURE WASHER", "out", "6100"],
  // stone and tile fabricators
  ["STONE SLAB SUPPLIER MSI SURFACES", "out", "5000"], ["DIAMOND BLADE SUPPLY", "out", "6100"], ["MARBLE INSTITUTE OF AMERICA DUES", "out", "6170"],
  ["SLABSMITH SOFTWARE", "out", "6060"], ["HOMEOWNER COUNTERTOP DEPOSIT", "in", "4000"],
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
