// Store CP-SAT answers (eval/bowling-mirror-cpsat.py, with or without --soft) in the page's tables, 2026-11-24.
// node eval/bowling-cpsat-apply.mjs [--write] answer.json...
// Each answer's plan is re-checked here with the page's own offBound on roundRobin's rounds (the solver's
// "off" is not trusted). At 0 off it goes to bowling-lane-table.mjs (via the same insert as
// eval/bowling-lane-table-insert.mjs) and its LANE_NEAR entry is dropped; closer than the stored
// LANE_NEAR entry, it replaces that entry's code and off (page kept). Without --write it only reports.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { offBound } from "../bowling.mjs";
import { roundRobin } from "../calc.mjs";
import { LANE_TABLE } from "../bowling-lane-table.mjs";
import { LANE_NEAR } from "../bowling-lane-near.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const write = args.includes("--write");
const files = args.filter((a) => a !== "--write");

export function checkAnswer(ans) {
  const { n, W, plan } = ans;
  const P = n / 2, cyc = roundRobin(n);
  const rounds = Array.from({ length: W }, (_, w) => cyc[w % cyc.length].matches);
  if (plan.length !== W) throw new Error(`${n}x${W}: ${plan.length} weeks in the plan`);
  const full = rounds.map((wk, w) => {
    if (new Set(plan[w]).size !== P) throw new Error(`${n}x${W}: week ${w + 1} is not a permutation`);
    return wk.map(([a, b], k) => [a, b, plan[w][k]]);
  });
  return { key: `${n},${W}`, off: offBound(full, n, P), code: plan.flat().map((p) => p.toString(36)).join("") };
}

const toTable = {}, toNear = {};
for (const f of files) {
  const ans = JSON.parse(readFileSync(f, "utf8"));
  if (!ans.plan) { console.log(`${ans.n}x${ans.W}: ${ans.status}, no plan (${ans.seconds} s)`); continue; }
  const { key, off, code } = checkAnswer(ans);
  const near = LANE_NEAR[key];
  if (LANE_TABLE[key]) console.log(`${key}: already at the bound in LANE_TABLE (this answer off ${off})`);
  else if (off === 0) { toTable[key] = code; console.log(`${key}: off 0, to LANE_TABLE (near had ${near?.off ?? "none"})`); }
  else if (near && off < near.off) { toNear[key] = { off, code }; console.log(`${key}: off ${off}, closer than near's ${near.off}`); }
  else console.log(`${key}: off ${off}, not closer (near ${near?.off ?? "none"})`);
}

if (write) {
  const nearFile = join(root, "bowling-lane-near.mjs");
  let text = readFileSync(nearFile, "utf8");
  for (const key of [...Object.keys(toTable), ...Object.keys(toNear)]) {
    const re = new RegExp(`^  "${key}": \\{ off: (\\d+), page: (\\d+), code: "[0-9a-z]+" \\},?\\n`, "m");
    const m = text.match(re);
    if (!m) continue;
    text = toTable[key] ? text.replace(re, "")
      : text.replace(re, `  "${key}": { off: ${toNear[key].off}, page: ${m[2]}, code: "${toNear[key].code}" },\n`);
  }
  writeFileSync(nearFile, text);
  if (Object.keys(toTable).length) {
    const tableFile = join(root, "bowling-lane-table.mjs");
    const lines = readFileSync(tableFile, "utf8").split("\n");
    const start = lines.findIndex((l) => l.startsWith("export const LANE_TABLE"));
    const end = lines.indexOf("};", start);
    const entries = {};
    for (const l of lines.slice(start + 1, end)) { const mm = l.match(/^\s*"([^"]+)": "([^"]+)",?$/); if (mm) entries[mm[1]] = mm[2]; }
    Object.assign(entries, toTable);
    const keys = Object.keys(entries).sort((a, b) => { const [n1, w1] = a.split(",").map(Number), [n2, w2] = b.split(",").map(Number); return n1 - n2 || w1 - w2; });
    const note = `// 2026-11-24, CP-SAT (eval/bowling-mirror-cpsat.py, eval/bowling-cpsat-apply.mjs): ${Object.keys(toTable).join(" and ")}.`;
    writeFileSync(tableFile, [...lines.slice(0, start), note, lines[start], ...keys.map((k) => `  "${k}": "${entries[k]}",`), ...lines.slice(end)].join("\n"));
  }
}
