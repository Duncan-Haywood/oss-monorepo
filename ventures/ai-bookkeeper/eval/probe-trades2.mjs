// Small-business spend probe 2 (2026-10-28): 90 descriptors in the shapes US banks print, for
// businesses the first probe (114 lines) did not cover: freight, farms, clinics, childcare,
// salons, fitness studios, photographers, realtors and bookkeepers. Agent-written from the
// companies' public names, not from a real export; expected accounts were fixed before the
// first run. Usage: node eval/probe-trades2.mjs [--misses]
import { suggest, trainClassifier } from "../categorize.mjs";
export const PROBE = [
  // freight and trucking
  ["PILOT TRAVEL CTR #412 PORTLAND OR", "out", "6160"], ["LOVES TRAVEL STOP 0321", "out", "6160"], ["TA PETRO 118 BOISE ID", "out", "6160"],
  ["DAT SOLUTIONS LOAD BOARD", "out", "6060"], ["TRUCKSTOP.COM SUBSCRIPTION", "out", "6060"], ["PREPASS SERVICES", "out", "6110"],
  ["IFTA FUEL TAX FILING", "out", "6110"], ["PEDIGREE TRUCK PARTS", "out", "6090"], ["TRUCK TIRE CENTER", "out", "6090"],
  ["PROGRESSIVE COMMERCIAL AUTO", "out", "6030"], ["MOTIVE TECHNOLOGIES ELD", "out", "6060"],
  // farms and ranches
  ["TRACTOR SUPPLY CO #1204", "out", "6100"], ["FARM CREDIT SERVICES INTEREST", "out", "6040"], ["SOUTHERN STATES CO-OP", "out", "6100"],
  ["TSC FEED AND SEED", "out", "6100"], ["VETERINARY CLINIC LARGE ANIMAL", "out", "6090"], ["FARMERS MARKET VENDOR FEE", "out", "6110"],
  ["COUNTY FAIR BOOTH FEE", "out", "6000"], ["SQ *HONEY CO MARKET SALES", "in", "4000"], ["USDA FSA PAYMENT", "in", "4000"],
  // clinics and practices
  ["HENRY SCHEIN DENTAL SUPPLY", "out", "6100"], ["PATTERSON DENTAL", "out", "6100"], ["MEDLINE INDUSTRIES", "out", "6100"],
  ["ATHENAHEALTH BILLING", "out", "6060"], ["SIMPLEPRACTICE", "out", "6060"], ["JANE APP SUBSCRIPTION", "out", "6060"],
  ["STATE BOARD OF DENTISTRY LICENSE RENEWAL", "out", "6110"], ["HEALTHCARE PROVIDERS SERVICE ORGANIZATION", "out", "6030"],
  ["CLAIM.MD ELECTRONIC CLAIMS", "out", "6060"], ["AVAILITY PAYER PAYMENT", "in", "4000"],
  // childcare and education
  ["CARE.COM BACKGROUND CHECK", "out", "6050"], ["BRIGHTWHEEL", "out", "6060"], ["LAKESHORE LEARNING MATERIALS", "out", "6100"],
  ["SCHOOL SPECIALTY INC", "out", "6100"], ["USDA CACFP REIMBURSEMENT", "in", "4000"], ["CHILD CARE LICENSING FEE", "out", "6110"],
  ["TEACHERS PAY TEACHERS PAYOUT", "in", "4000"], ["CPR AMERICAN RED CROSS TRAINING", "out", "6170"], ["KINDERCARE TUITION PMT", "in", "4000"],
  // salons and barbershops
  ["SALON CENTRIC", "out", "6100"], ["SALLY BEAUTY SUPPLY", "out", "6100"], ["VAGARO SUBSCRIPTION", "out", "6060"],
  ["BOOKSY PAYOUT", "in", "4000"], ["STYLESEAT", "out", "6060"], ["BARBICIDE AND BLADES CO", "out", "6100"], ["BOOTH RENT RECEIVED", "in", "4000"],
  ["COSMETOLOGY BOARD LICENSE", "out", "6110"], ["FRESHA PAYMENT", "in", "4000"],
  // fitness and studios
  ["MINDBODY INC", "out", "6060"], ["MINDBODY PAYOUT", "in", "4000"], ["ZENPLANNER", "out", "6060"], ["PUSHPRESS", "out", "6060"],
  ["ROGUE FITNESS", "out", "6100"], ["BMI MUSIC LICENSING", "out", "6110"], ["ASCAP LICENSE", "out", "6110"],
  ["YOGA ALLIANCE REGISTRY", "out", "6170"], ["CLASSPASS PAYOUT", "in", "4000"], ["GLOFOX", "out", "6060"],
  // photographers and videographers
  ["PIC-TIME", "out", "6060"], ["SMUGMUG", "out", "6060"], ["ADOBE *CREATIVE CLOUD", "out", "6060"], ["PIXIESET", "out", "6060"],
  ["WHCC PRINT LAB", "out", "6100"], ["BAY PHOTO LAB", "out", "6100"], ["THE KNOT WORLDWIDE", "out", "6000"],
  ["HONEYBOOK", "out", "6060"], ["DUBSADO", "out", "6060"], ["WEDDINGWIRE", "out", "6000"], ["PHOTOGRAPHERS INSURANCE PPA", "out", "6030"],
  // realtors and agents
  ["ZILLOW PREMIER AGENT", "out", "6000"], ["REALTOR.COM LEADS", "out", "6000"], ["MLS ACCESS FEE", "out", "6110"],
  ["NAR DUES", "out", "6170"], ["FOLLOW UP BOSS", "out", "6060"], ["DOTLOOP", "out", "6060"], ["SUPRA LOCKBOX KEY", "out", "6070"],
  ["ERRORS AND OMISSIONS INSURANCE REALTOR", "out", "6030"], ["COMMISSION DEPOSIT TITLE CO", "in", "4000"], ["REAL BROKER LLC", "in", "4000"],
  // bookkeepers, consultants and agencies
  ["GUSTO FEE", "out", "6060"], ["INTUIT *QBooks Online", "out", "6060"], ["AICPA MEMBERSHIP", "out", "6170"],
  ["KARBON HQ", "out", "6060"], ["PRACTICE IGNITION", "out", "6060"], ["LOOM SUBSCRIPTION", "out", "6060"], ["CALENDLY", "out", "6060"],
  ["TOGGL TRACK", "out", "6060"], ["CLOCKIFY", "out", "6060"], ["WISE US INC FEE", "out", "6010"], ["UPWORK ESCROW", "out", "6020"],
  ["DEEL INC CONTRACTOR PAYMENT", "out", "6020"], ["TAX PREPARATION SOFTWARE DRAKE", "out", "6060"],
];
const model = { classifier: trainClassifier([]), memory: new Map(), rules: [], codes: null };
let ok = 0, wrong = 0, none = 0; const misses = [];
for (const [desc, d, want] of PROBE) {
  const s = suggest({ desc, cents: d === "out" ? -1000 : 1000 }, model);
  if (s.account === want) ok++; else { s.account ? wrong++ : none++; misses.push(`${s.account ? "WRONG" : "none "} ${desc} -> ${s.account ?? "-"} (want ${want})`); }
}
console.log(`${PROBE.length} descriptors: ${ok} right, ${wrong} wrong, ${none} no suggestion`);
if (process.argv.includes("--misses")) console.log(misses.join("\n"));
