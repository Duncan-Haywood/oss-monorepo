// Gap probe 8 (2026-10-30): descriptors in the shapes US banks print, for businesses probes 1 to 7
// did not cover: owner-operator truckers, small farms, tattoo artists, personal trainers and coaches,
// wedding DJs and event rentals. Agent-written from public company names, not from a real export.
// Expected accounts were fixed before the first run, to the repo's conventions (supply houses 6100,
// postage 6070, diesel and tolls 6160, dues 6170). After the first run I dropped three ambiguous
// lines of my own (TSC Feed as cost of goods, Planet Fitness as rent, a bare Venmo from a client) and PrePass, which an older probe pins to 6110.
// Usage: node eval/probe8.mjs [--misses]
import { suggest, trainClassifier } from "../categorize.mjs";
export const PROBE = [
  // owner-operator truckers
  ["PILOT FLYING J #482", "out", "6160"], ["LOVES TRAVEL STOP", "out", "6160"], ["TA PETRO", "out", "6160"], ["COMDATA FUEL", "out", "6160"],
  ["DAT LOAD BOARD", "out", "6060"], ["TRUCKSTOP.COM", "out", "6060"], ["TRIUMPH FREIGHT FACTORING", "out", "6010"], ["RTS FINANCIAL", "out", "6010"],
  ["EZ PASS TOLL", "out", "6160"], ["PRIME INC SETTLEMENT", "in", "4000"], ["FMCSA UCR FEE", "out", "6110"],
  ["OOIDA DUES", "out", "6170"], ["FLEETPRIDE", "out", "6090"], ["TRUCKPRO", "out", "6090"], ["ELD SUBSCRIPTION MOTIVE", "out", "6060"],
  // small farms
  ["TRACTOR SUPPLY CO", "out", "6100"], ["JOHNNYS SELECTED SEEDS", "out", "6100"], ["FARM CREDIT SERVICES INTEREST", "out", "6040"],
  ["LOCAL HARVEST PAYOUT", "in", "4000"], ["FARMERS MARKET VENDOR FEE", "out", "6110"], ["CSA SHARE PAYMENT ZELLE", "in", "4000"], ["FARM BUREAU DUES", "out", "6170"],
  ["USDA ORGANIC CERTIFICATION", "out", "6110"], ["RURAL ELECTRIC COOP", "out", "6140"], ["NATIONAL FFA SUPPLY", "out", "6100"], ["HARVEST HAND PAYROLL", "out", "6150"],
  // tattoo artists
  ["INKBOX SUPPLY", "out", "6100"], ["EZ TATTOO SUPPLY", "out", "6100"], ["KURO SUMI", "out", "6100"], ["COUNTY HEALTH DEPT TATTOO PERMIT", "out", "6110"],
  ["SQUARE DEPOSIT", "in", "4000"], ["BLOODBORNE PATHOGEN TRAINING", "out", "6170"], ["SHARPS DISPOSAL", "out", "6100"], ["STUDIO BOOTH RENT", "out", "6080"],
  // trainers and coaches
  ["TRAINERIZE", "out", "6060"], ["TRUECOACH", "out", "6060"], ["MINDBODY", "out", "6060"], ["NASM RECERTIFICATION", "out", "6170"],
  ["ACE FITNESS CERT", "out", "6170"], ["STRIPE TRANSFER", "in", "4000"],
  ["CPR AED RECERT", "out", "6170"], ["COACH ACCOUNTABILITY INSURANCE", "out", "6030"], ["TRAINING PEAKS", "out", "6060"], ["ICF DUES", "out", "6170"],
  // wedding DJs and event rentals
  ["DJ INTELLIGENCE", "out", "6060"], ["SOUNDCLOUD", "out", "6060"], ["BPM SUPREME", "out", "6060"], ["SESAC LICENSE", "out", "6110"],
  ["BMI MUSIC LICENSE", "out", "6110"], ["ASCAP LICENSE", "out", "6110"], ["PARTY CITY", "out", "6100"], ["THE KNOT PAYMENT", "out", "6000"],
  ["WEDDINGWIRE", "out", "6000"], ["EVENT BOOKING DEPOSIT ZELLE", "in", "4000"], ["BALANCE DUE WEDDING ZELLE", "in", "4000"], ["U-HAUL TRUCK RENTAL", "out", "6160"],
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
