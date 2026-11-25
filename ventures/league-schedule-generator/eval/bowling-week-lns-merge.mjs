// Put eval/bowling-week-lns.c answers into bowling-lane-near.mjs where they are strictly closer to the
// bound than the stored entry. Each answer is re-checked with the page's offBound on the page's rounds.
// node eval/bowling-week-lns-merge.mjs <lns-out.json>...   (rewrites bowling-lane-near.mjs in place)
import { readFileSync, writeFileSync } from "node:fs";
import { offBound } from "../bowling.mjs";
import { roundRobin } from "../calc.mjs";
import { LANE_NEAR } from "../bowling-lane-near.mjs";
const file = new URL("../bowling-lane-near.mjs", import.meta.url);
let text = readFileSync(file, "utf8");
for (const f of process.argv.slice(2)) {
  const lines = readFileSync(f, "utf8").trim().split("\n").filter((l) => l.startsWith("{"));
  if (!lines.length) continue;
  const j = JSON.parse(lines.at(-1));
  const key = `${j.n},${j.W}`, P = j.n / 2, e = LANE_NEAR[key];
  if (!e) { console.error(`${key}: not in LANE_NEAR, skipped`); continue; }
  const cyc = roundRobin(j.n);
  const plan = j.plan.map((wk, w) => cyc[w % cyc.length].matches.map(([a, b], m) => [a, b, wk[m]]));
  if (!plan.every((wk) => new Set(wk.map((m) => m[2])).size === P)) { console.error(`${key}: not a permutation`); continue; }
  const off = offBound(plan, j.n, P);
  const now = Number(text.match(new RegExp(`"${key}": \\{ off: (\\d+)`))[1]);
  if (off >= now) { console.error(`${key}: off ${off}, stored ${now}: kept`); continue; }
  const code = j.plan.flat().map((p) => p.toString(36)).join("");
  text = text.replace(new RegExp(`"${key}": \\{ off: \\d+, page: (\\d+), code: "[0-9a-z]+" \\}`), (_, page) => `"${key}": { off: ${off}, page: ${page}, code: "${code}" }`);
  console.error(`${key}: off ${now} -> ${off}`);
}
writeFileSync(file, text);
