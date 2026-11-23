// Collect eval/bowling-lane-tabu.c (and count-model) answers: re-check each against the bound with the
// page's own offBound, keep the ones at 0, print them as a JSON part for eval/bowling-lane-table-merge.mjs.
// node eval/bowling-lane-tabu-collect.mjs out/*.json > part.json   (files: one {"n","W","off","code"} line,
// or {"n,W": code} objects from eval/bowling-count-model.py)
import { readFileSync } from "node:fs";
import { offBound } from "../bowling.mjs";
import { roundRobin } from "../calc.mjs";
const table = {};
for (const f of process.argv.slice(2)) {
  const text = readFileSync(f, "utf8").trim();
  if (!text) continue;
  for (const line of text.split("\n")) {
    const j = JSON.parse(line);
    const entries = j.code ? [[`${j.n},${j.W}`, j.code]] : Object.entries(j);
    for (const [key, code] of entries) {
      const [n, W] = key.split(",").map(Number), P = n / 2;
      const cyc = roundRobin(n);
      const plan = [];
      for (let w = 0; w < W; w++) plan.push(cyc[w % cyc.length].matches.map(([a, b], m) => [a, b, parseInt(code[w * P + m], 36)]));
      const perms = plan.every((wk) => new Set(wk.map((m) => m[2])).size === P);
      const off = offBound(plan, n, P);
      console.error(`${key}: ${perms ? "" : "NOT A PERMUTATION, "}off ${off}${off === 0 && perms ? " (kept)" : ""}`);
      if (off === 0 && perms) table[key] = code;
    }
  }
}
console.log(JSON.stringify(table));
