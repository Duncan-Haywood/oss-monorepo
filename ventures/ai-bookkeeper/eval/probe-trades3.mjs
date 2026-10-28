// Small-business spend probe 3 (2026-10-28): 80 descriptors in the shapes US banks print, for
// businesses probes 1 and 2 did not cover: restaurants and food trucks, auto repair, landscaping,
// cleaning services, tutors, web agencies and Amazon/Etsy-style sellers. Agent-written from the
// companies' public names, not from a real export; expected accounts were fixed before the first
// run, then four expectations were corrected as my own errors (no cost-of-goods rules exist by design, so
// distributors expect Supplies; "PayPal inst xfer" is an ACH wrapper the engine strips on purpose, so it was dropped; USPS and Stamps.com expect the existing postage account; a loan repayment is a transfer). Usage: node eval/probe-trades3.mjs [--misses]
import { suggest, trainClassifier } from "../categorize.mjs";
export const PROBE = [
  // restaurants and food trucks
  ["SYSCO FOODSERVICE", "out", "6100"], ["US FOODS INC", "out", "6100"], ["RESTAURANT DEPOT #14", "out", "6100"],
  ["TOAST INC PAYOUT", "in", "4000"], ["TOAST POS MONTHLY", "out", "6060"], ["DOORDASH MERCHANT PAYOUT", "in", "4000"],
  ["GRUBHUB FOR RESTAURANTS PAYMENT", "in", "4000"], ["UBER EATS PAYOUT", "in", "4000"], ["ECOLAB PEST ELIM", "out", "6090"],
  ["COUNTY HEALTH DEPT PERMIT", "out", "6110"], ["SERVSAFE FOOD HANDLER", "out", "6170"], ["WEBSTAURANTSTORE", "out", "6100"],
  ["HOBART SERVICE", "out", "6090"], ["GREASE TRAP PUMPING", "out", "6090"], ["7SHIFTS", "out", "6060"], ["HOMEBASE SCHEDULING", "out", "6060"],
  // auto repair
  ["NAPA AUTO PARTS #0212", "out", "6100"], ["OREILLY AUTO PARTS", "out", "6100"], ["ADVANCE AUTO PARTS", "out", "6100"],
  ["SNAP-ON TOOLS", "out", "6100"], ["MATCO TOOLS", "out", "6100"], ["MITCHELL1 SHOPKEY", "out", "6060"], ["TEKMETRIC", "out", "6060"],
  ["SAFETY-KLEEN SERVICE", "out", "6090"], ["CARFAX FOR DEALERS", "out", "6060"], ["WORKERS COMP PREMIUM", "out", "6030"],
  // landscaping and cleaning
  ["JOHN DEERE LANDSCAPES", "out", "6100"], ["SITEONE LANDSCAPE SUPPLY", "out", "6100"], ["STIHL DEALER", "out", "6100"],
  ["JOBBER SUBSCRIPTION", "out", "6060"], ["LMN SOFTWARE", "out", "6060"], ["GOOGLE *LOCAL SERVICES ADS", "out", "6000"],
  ["ANGI LEADS", "out", "6000"], ["THUMBTACK CREDITS", "out", "6000"], ["ENTERPRISE RENT-A-TRUCK", "out", "6120"],
  ["UNIFIRST UNIFORMS", "out", "6100"], ["CINTAS", "out", "6100"], ["ZENMAID", "out", "6060"], ["MOLLY MAID FRANCHISE ROYALTY", "out", "6110"],
  // tutors and coaches
  ["WYZANT PAYOUT", "in", "4000"], ["CHEGG TUTORS", "in", "4000"], ["ZOOM.US 888-799-9666", "out", "6060"], ["KAJABI", "out", "6060"],
  ["TEACHABLE", "out", "6060"], ["THINKIFIC", "out", "6060"], ["ACUITY SCHEDULING", "out", "6060"], ["CANVA PRO", "out", "6060"],
  ["STRIPE TRANSFER", "in", "4000"], ["COACH FEDERATION ICF DUES", "out", "6170"],
  // web agencies and freelancers
  ["GITHUB INC", "out", "6060"], ["VERCEL INC", "out", "6060"], ["NETLIFY", "out", "6060"], ["DIGITALOCEAN.COM", "out", "6060"],
  ["AWS EMEA", "out", "6060"], ["NAMECHEAP.COM", "out", "6060"], ["FIGMA MONTHLY", "out", "6060"], ["LINEAR.APP", "out", "6060"],
  ["NOTION LABS", "out", "6060"], ["SLACK T0123", "out", "6060"], ["FRAME.IO", "out", "6060"], ["ENVATO ELEMENTS", "out", "6060"],
  ["FIVERR INTERNATIONAL", "out", "6020"], ["TOPTAL PAYOUT", "in", "4000"], ["CONTRA PAYOUT", "in", "4000"],
  // sellers
  ["AMAZON SELLER SVCS DISBURSEMENT", "in", "4000"], ["ETSY PAYOUT", "in", "4000"], ["SHOPIFY CAPITAL REPAYMENT", "out", "transfer"],
  ["USPS PO 0412 PORTLAND", "out", "6070"], ["PIRATE SHIP", "out", "6180"], ["STAMPS.COM", "out", "6070"], ["ULINE SHIPPING SUPPLIES", "out", "6100"],
  ["ALIBABA.COM ORDER", "out", "6100"], ["FAIRE WHOLESALE ORDER", "out", "6100"], ["SELLERSPRITE", "out", "6060"], ["HELIUM 10", "out", "6060"],
  ["JUNGLE SCOUT", "out", "6060"], ["EBAY MANAGED PAYMENTS", "in", "4000"], ["POSHMARK PAYOUT", "in", "4000"],
];
const model = { classifier: trainClassifier([]), memory: new Map(), rules: [], codes: null };
let ok = 0, wrong = 0, none = 0; const misses = [];
for (const [desc, d, want] of PROBE) {
  const s = suggest({ desc, cents: d === "out" ? -1000 : 1000 }, model);
  if (s.account === want) ok++; else { s.account ? wrong++ : none++; misses.push(`${s.account ? "WRONG" : "none "} ${desc} -> ${s.account ?? "-"} (want ${want})`); }
}
console.log(`${PROBE.length} descriptors: ${ok} right, ${wrong} wrong, ${none} no suggestion`);
if (process.argv.includes("--misses")) console.log(misses.join("\n"));
