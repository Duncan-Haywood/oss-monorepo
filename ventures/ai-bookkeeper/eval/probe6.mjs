// Gap probe 6 (2026-10-30): 70 descriptors in the shapes US banks print, for businesses probes 1 to 5
// did not cover: cafes and bakeries, solo lawyers and real-estate or insurance agents, landscaping and
// cleaning crews, veterinary and chiropractic practices, and early SaaS founders. Agent-written from
// public company names, not from a real export. Expected accounts were fixed before the first run, then food and vet distributors, Supra and IOLTA expectations were corrected to the repo's existing conventions (6100 supplies, 6070, transfer); John Deere Financial, Y Combinator and Costco are left for a person on purpose: my errors, not rule gaps.
// Usage: node eval/probe6.mjs [--misses]
import { suggest, trainClassifier } from "../categorize.mjs";
export const PROBE = [
  // cafes and bakeries
  ["SYSCO FOOD SERVICES", "out", "6100"], ["US FOODS", "out", "6100"], ["RESTAURANT DEPOT", "out", "6100"], ["WEBSTAURANTSTORE", "out", "6100"],
  ["TOAST INC DEPOSIT", "in", "4000"], ["TOAST POS MONTHLY", "out", "6060"], ["SQUARE INC DEPOSIT", "in", "4000"], ["DOORDASH PAYOUT", "in", "4000"],
  ["GRUBHUB PAYOUT", "in", "4000"], ["UBER EATS PAYOUT", "in", "4000"], ["ECOLAB PEST", "out", "6090"], ["CINTAS FIRST AID", "out", "6100"],
  ["COUNTY HEALTH DEPT PERMIT", "out", "6110"], ["COSTCO BUSINESS DELIVERY", "out", ""], ["KING ARTHUR BAKING WHOLESALE", "out", "6100"], ["ROYAL CUP COFFEE", "out", "6100"],
  ["7SHIFTS", "out", "6060"], ["HOMEBASE SCHEDULING", "out", "6060"], ["WASTE MANAGEMENT", "out", "6140"],
  // solo lawyers and agents
  ["CLIO", "out", "6060"], ["MYCASE", "out", "6060"], ["LAWPAY", "out", "6010"], ["STATE BAR DUES", "out", "6170"],
  ["WESTLAW", "out", "6060"], ["LAWYERS MUTUAL INSURANCE", "out", "6030"], ["IOLTA TRANSFER", "out", "transfer"], ["MLS FEES NAR", "out", "6170"],
  ["ZILLOW PREMIER AGENT", "out", "6000"], ["REALTOR.COM LEADS", "out", "6000"], ["SKYSLOPE", "out", "6060"], ["DOTLOOP", "out", "6060"],
  ["FOLLOW UP BOSS", "out", "6060"], ["LOCKBOX SUPRA", "out", "6070"], ["E&O INSURANCE AGENCY", "out", "6030"], ["COMMISSION CLOSING TITLE CO", "in", "4000"],
  ["APPLIED EPIC", "out", "6060"], ["AGENCY BLOC", "out", "6060"], ["STATE INSURANCE DEPT LICENSE RENEWAL", "out", "6110"],
  // landscaping and cleaning
  ["JOHN DEERE FINANCIAL", "out", ""], ["STIHL DEALER", "out", "6100"], ["SITEONE LANDSCAPE SUPPLY", "out", "6100"], ["HOME DEPOT PRO XTRA", "out", "6100"],
  ["LAWN LOVE", "out", "6060"], ["YARDBOOK", "out", "6060"], ["SERVICE AUTOPILOT", "out", "6060"], ["HOUSECALL PRO", "out", "6060"],
  ["BOOKING KOALA", "out", "6060"], ["MAID CENTRAL", "out", "6060"], ["SUNBELT RENTALS", "out", "6090"], ["SHELL FLEET CARD", "out", "6160"],
  ["THUMBTACK LEADS", "out", "6000"], ["ANGI LEADS", "out", "6000"], ["CLEANING PRODUCTS ULINE", "out", "6100"], ["WORKERS COMP AUDIT PREMIUM", "out", "6030"],
  // veterinary and chiropractic
  ["IDEXX LABORATORIES", "out", "6100"], ["COVETRUS", "out", "6100"], ["PATTERSON VETERINARY", "out", "6100"],
  ["CHIROTOUCH", "out", "6060"], ["JANE APP", "out", "6060"], ["SIMPLEPRACTICE", "out", "6060"], ["VETSOURCE", "out", "6060"],
  ["CARECREDIT PAYOUT", "in", "4000"], ["SCRUBS AND BEYOND", "out", "6100"], ["DEA REGISTRATION RENEWAL", "out", "6110"], ["AVMA DUES", "out", "6170"],
  // early SaaS founders
  ["STRIPE PAYOUT", "in", "4000"], ["PADDLE.COM PAYOUT", "in", "4000"], ["POSTHOG", "out", "6060"], ["SENTRY.IO", "out", "6060"],
  ["SUPABASE", "out", "6060"], ["FLY.IO", "out", "6060"], ["RENDER.COM", "out", "6060"], ["PLAUSIBLE ANALYTICS", "out", "6060"],
  ["MAILGUN", "out", "6060"], ["LINEAR ORBIT", "out", "6060"], ["Y COMBINATOR", "out", ""], ["CARTA INC", "out", "6050"],
  ["STRIPE ATLAS", "out", "6050"], ["FIRSTBASE", "out", "6050"],
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
