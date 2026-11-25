// Write bowling-lane-min.mjs's table and eval/bowling-lane-min-2026-11-24.txt's rows from CP-SAT --soft answers.
// node eval/bowling-lane-min-build.mjs answer.json...   (prints the rows; OPTIMAL ones also go to LANE_MIN)
// Each answer's plan is re-checked with offBound; only status OPTIMAL (answer = proved bound) is stored.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { checkAnswer } from "./bowling-cpsat-apply.mjs";
import { offBound, assignLanes } from "../bowling.mjs";
import { roundRobin } from "../calc.mjs";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rows = [], min = {};
for (const f of process.argv.slice(2)) {
  const a = JSON.parse(readFileSync(f, "utf8"));
  if (!a.plan || a.off === undefined) continue;
  const { key, off } = checkAnswer(a);
  if (off !== a.off) throw new Error(`${key}: solver says ${a.off}, offBound ${off}`);
  const P = a.n / 2, cyc = roundRobin(a.n);
  const page = offBound(assignLanes(Array.from({ length: a.W }, (_, w) => cyc[w % cyc.length].matches), a.n, P), a.n, P);
  if (a.status === "OPTIMAL") min[key] = off;
  rows.push([a.n, a.W, a.status, off, a.bound, a.seconds, page]);
}
rows.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
for (const r of rows) console.log(`${String(r[0]).padStart(5)} ${String(r[1]).padStart(5)} | ${r[2].padEnd(8)} | ${String(r[3]).padStart(4)} | ${String(r[4]).padStart(5)} | ${String(r[5]).padStart(6)} | ${String(r[6]).padStart(4)}`);
const file = join(root, "bowling-lane-min.mjs");
const text = readFileSync(file, "utf8");
const keys = Object.keys(min).sort((a, b) => { const [n1, w1] = a.split(",").map(Number), [n2, w2] = b.split(",").map(Number); return n1 - n2 || w1 - w2; });
writeFileSync(file, text.replace(/export const LANE_MIN = \{[\s\S]*?\n\};/, `export const LANE_MIN = {\n${keys.map((k) => `  "${k}": ${min[k]},`).join("\n")}\n};`));
