// Gap probe 35 (2026-11-10): descriptors in the shapes US banks print, for trades earlier probes did not
// cover: drone photographers, notary signing agents, mobile dog groomers, piano tuners, beekeepers.
// Agent-written from public company names, not from a real export. Expected accounts fixed before the
// first run (a farmers-market booth fee was dropped: fee, rent or licence depends on the market), to the repo's conventions (supply houses 6100, software 6060, dues and training 6170,
// licences and permits 6110, insurance 6030, platform fees 6000, cost of goods 5000, sales 4000).
// Usage: node eval/probe35.mjs [--misses]
import { suggest, trainClassifier } from "../categorize.mjs";
export const PROBE = [
  // drone photographers
  ["DJI STORE ORDER", "out", "6100"], ["DRONEDEPLOY SUBSCRIPTION", "out", "6060"], ["FAA DRONE ZONE PART 107 REGISTRATION", "out", "6110"],
  ["AIRMAP AIRSPACE AUTHORIZATION", "out", "6060"], ["ASSOCIATION FOR UNMANNED VEHICLE SYSTEMS DUES", "out", "6170"],
  // notary signing agents
  ["NATIONAL NOTARY ASSOCIATION DUES", "out", "6170"], ["SECRETARY OF STATE NOTARY COMMISSION", "out", "6110"], ["SNAPDOCS SIGNING FEE", "in", "4000"],
  ["NOTARY ESSENTIALS JOURNAL AND SEAL", "out", "6100"], ["NOTARY ERRORS AND OMISSIONS POLICY", "out", "6030"],
  // mobile dog groomers
  ["PETEDGE GROOMING SUPPLIES", "out", "6100"], ["ANDIS CLIPPER BLADES", "out", "6100"], ["MOEGO SCHEDULING", "out", "6060"],
  ["NATIONAL DOG GROOMERS ASSOCIATION DUES", "out", "6170"], ["PET GROOMING DEPOSIT", "in", "4000"],
  // piano tuners
  ["PIANO TECHNICIANS GUILD DUES", "out", "6170"], ["SCHAFF PIANO SUPPLY", "out", "6100"], ["TUNELAB PIANO TUNER APP", "out", "6060"],
  ["PIANO TUNING PAYMENT", "in", "4000"], ["TUNING LEVER AND MUTES KIT", "out", "6100"],
  // beekeepers
  ["MANN LAKE BEE SUPPLY", "out", "6100"], ["DADANT AND SONS", "out", "6100"], ["STATE APIARY REGISTRATION", "out", "6110"],
  ["AMERICAN BEEKEEPING FEDERATION DUES", "out", "6170"],
  ["PACKAGE BEES NUC PURCHASE", "out", "5000"], ["HONEY JAR WHOLESALE ORDER", "in", "4000"],
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
