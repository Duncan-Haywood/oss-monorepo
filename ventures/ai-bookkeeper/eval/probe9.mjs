// Gap probe 9 (2026-10-30): descriptors in the shapes US banks print, for businesses probes 1 to 8
// did not cover: cottage bakers, drone pilots, locksmiths, streamers, locum clinicians.
// Agent-written from public company names, not from a real export. Expected accounts were fixed
// before the first run, to the repo's conventions (supply houses 6100, software 6060, dues and
// training 6170, licences and permits 6110, insurance 6030, platform fees 6000).
// After the first run I dropped Elgato and B&H Photo, which an older creator test pins to 6070.
// Usage: node eval/probe9.mjs [--misses]
import { suggest, trainClassifier } from "../categorize.mjs";
export const PROBE = [
  // cottage bakers
  ["WEBSTAURANTSTORE", "out", "6100"], ["KING ARTHUR BAKING", "out", "6100"], ["SUGAR ART SUPPLY", "out", "6100"], ["ULINE BOXES", "out", "6100"],
  ["STATE COTTAGE FOOD PERMIT", "out", "6110"], ["SERVSAFE CERTIFICATION", "out", "6170"], ["FARMERS MARKET BOOTH FEE", "out", "6110"],
  ["SQUARE PAYOUT", "in", "4000"], ["CAKE ORDER DEPOSIT ZELLE", "in", "4000"], ["COSTCO BUSINESS CENTER", "out", "6100"],
  // drone pilots
  ["DJI STORE", "out", "6100"], ["FAA DRONEZONE", "out", "6110"], ["PIX4D", "out", "6060"], ["DRONEDEPLOY", "out", "6060"],
  ["SKYWARD AVIATION INSURANCE", "out", "6030"], ["LAANC AIRSPACE AUTH", "out", "6110"], ["PART 107 EXAM FEE", "out", "6170"],
  ["PROPELLER AERO", "out", "6060"], ["BATTERY BARN DRONE", "out", "6100"],
  // locksmiths
  ["HILLMAN GROUP", "out", "6100"], ["SOUTHERN LOCK AND SUPPLY", "out", "6100"], ["KEYLESS ENTRY WHOLESALE", "out", "6100"],
  ["ALOA DUES", "out", "6170"], ["LOCKSMITH LICENSE RENEWAL", "out", "6110"], ["HOMEADVISOR LEAD", "out", "6000"], ["ANGI LEADS", "out", "6000"],
  ["THUMBTACK CREDITS", "out", "6000"], ["SERVICEPRO DISPATCH", "out", "6060"], ["JOBBER", "out", "6060"],
  // streamers and YouTubers
  ["TWITCH PAYOUT", "in", "4000"], ["YOUTUBE ADSENSE", "in", "4000"], ["PATREON PAYOUT", "in", "4000"],
  ["STREAMLABS", "out", "6060"], ["EPIDEMIC SOUND", "out", "6060"], ["ADOBE CREATIVE CLOUD", "out", "6060"],
  ["CANVA PRO", "out", "6060"], ["VIDIQ", "out", "6060"], ["MEMBERFUL", "out", "6060"], ["SPONSORSHIP WIRE FROM AGENCY", "in", "4000"],
  // locum clinicians and contract nurses
  ["CMS MEDICAL LICENSE RENEWAL", "out", "6110"], ["NURSE LICENSE COMPACT FEE", "out", "6110"], ["BLS ACLS RECERT", "out", "6170"],
  ["AANP DUES", "out", "6170"], ["AMA MEMBERSHIP", "out", "6170"], ["MALPRACTICE TAIL COVERAGE", "out", "6030"], ["DEA REGISTRATION", "out", "6110"],
  ["CHG HEALTHCARE PAYMENT", "in", "4000"], ["AYA LOCUM TENENS PAYMENT", "in", "4000"], ["UPTODATE SUBSCRIPTION", "out", "6060"], ["CME CONFERENCE REGISTRATION", "out", "6170"],
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
