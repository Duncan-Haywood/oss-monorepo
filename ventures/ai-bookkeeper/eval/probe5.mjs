// Gap probe 5 (2026-10-30): 64 descriptors in the shapes US banks print, for businesses probes 1 to 4
// did not cover: freelance developers and small agencies, dental and medical practices, landlords with a
// few rentals, and gyms and studios. Agent-written from public company names, not from a real export.
// Expected accounts were fixed before the first run. Usage: node eval/probe5.mjs [--misses]
import { suggest, trainClassifier } from "../categorize.mjs";
export const PROBE = [
  // freelance developers and agencies
  ["AMAZON WEB SERVICES AWS.AMAZON.CO", "out", "6060"], ["GITHUB INC", "out", "6060"], ["DIGITALOCEAN.COM", "out", "6060"], ["CLOUDFLARE", "out", "6060"],
  ["VERCEL INC", "out", "6060"], ["NAMECHEAP.COM", "out", "6060"], ["GODADDY.COM", "out", "6060"], ["JETBRAINS AMERICA", "out", "6060"],
  ["FIGMA MONTHLY", "out", "6060"], ["NOTION LABS", "out", "6060"], ["SLACK TECHNOLOGIES", "out", "6060"], ["OPENAI *CHATGPT SUBSCR", "out", "6060"],
  ["ANTHROPIC CLAUDE.AI", "out", "6060"], ["UPWORK ESCROW", "out", "6020"], ["UPWORK FREELANCER FEE", "out", "6010"], ["TOPTAL PAYOUT", "in", "4000"],
  ["STRIPE TRANSFER", "in", "4000"], ["GUSTO FEE", "out", "6060"], ["BREX CARD FEE", "out", "6010"], ["MERCURY IO", "out", "6010"],
  // dental and medical practices
  ["HENRY SCHEIN DENTAL", "out", "6100"], ["PATTERSON DENTAL SUPPLY", "out", "6100"], ["DENTRIX ASCEND", "out", "6060"], ["ATHENAHEALTH", "out", "6060"],
  ["CAREINGTON LABS", "out", "6050"], ["MEDPRO GROUP MALPRACTICE", "out", "6030"], ["DELTA DENTAL PAYMENT", "in", "4000"], ["CARECREDIT PAYOUT", "in", "4000"],
  ["STERICYCLE", "out", "6140"], ["MEDICAL WASTE PICKUP", "out", "6140"], ["AMERICAN DENTAL ASSOCIATION", "out", "6170"], ["STATE DENTAL BOARD LICENSE", "out", "6110"],
  ["CLEARBALANCE PAYOUT", "in", "4000"], ["HIPAA COMPLIANCE TRAINING", "out", "6170"], ["SCRUBS AND BEYOND", "out", "6100"], ["CINTAS UNIFORM", "out", "6100"],
  // landlords
  ["BUILDIUM", "out", "6060"], ["APPFOLIO", "out", "6060"], ["ZILLOW RENTAL MANAGER", "out", "6000"], ["APARTMENTS.COM LISTING", "out", "6000"],
  ["TENANT SCREENING TRANSUNION", "out", "6050"], ["RENTER INSURANCE LANDLORD POLICY", "out", "6030"], ["COUNTY PROPERTY TAX", "out", "6110"], ["WATER AND SEWER DISTRICT", "out", "6140"],
  ["ROTO ROOTER PLUMBING", "out", "6090"], ["ORKIN PEST CONTROL", "out", "6090"], ["MARTINEZ HVAC REPAIR", "out", "6090"], ["HOA DUES", "out", "6080"],
  ["TURBOTENANT", "out", "6060"], ["EVICTION FILING COURT FEE", "out", "6050"], ["MORTGAGE INTEREST", "out", "6040"], ["TENANT RENT PAYMENT", "in", "4000"],
  // gyms and studios
  ["MINDBODY", "out", "6060"], ["MARIANA TEK", "out", "6060"], ["GLOFOX", "out", "6060"], ["ZEN PLANNER", "out", "6060"],
  ["BMI MUSIC LICENSE", "out", "6110"], ["ACTIVE NETWORK", "out", "6060"], ["PERFECT GYM", "out", "6060"], ["PRO FITNESS EQUIPMENT REPAIR", "out", "6090"],
  ["REBEL FITNESS MEMBERSHIP DUES", "in", "4000"], ["CLASSPASS PAYOUT", "in", "4000"], ["ABC FITNESS", "out", "6060"], ["CHLORINE POOL SUPPLY", "out", "6100"],
  ["SPOTIFY BUSINESS", "out", "6060"], ["INSTAGRAM ADS", "out", "6000"], ["YELP ADVERTISING", "out", "6000"],
];
const model = { classifier: trainClassifier([]), memory: new Map(), rules: [], codes: null };
let ok = 0, wrong = 0, none = 0; const misses = [];
for (const [desc, d, want] of PROBE) {
  const s = suggest({ desc, cents: d === "out" ? -1000 : 1000 }, model);
  if (s.account === want) ok++; else { s.account ? wrong++ : none++; misses.push(`${s.account ? "WRONG" : "none "} ${desc} -> ${s.account ?? "-"} (want ${want})`); }
}
console.log(`${PROBE.length} descriptors: ${ok} right, ${wrong} wrong, ${none} no suggestion`);
if (process.argv.includes("--misses")) console.log(misses.join("\n"));
