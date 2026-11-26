// Figures the README, llms.txt and the comparison pages quote must equal what the code prints today.
// Added 2026-11-26 (red-team run): the optimiser page, llms.txt and two README tables still quoted the
// sample house at 2384.16 after the engine moved to 2384.44. The allowance-bench figures are checked
// in allowance-bench.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { samplePlan, takeoff } from "./engine.mjs";

const read = (f) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const pct = (a, b) => `+${((a / b - 1) * 100).toFixed(1)}%`;

test("vs-ordering-lumber-by-hand.html, the README bench block and llms.txt match `node bench.mjs`", () => {
  const out = execFileSync(process.execPath, [new URL("./bench.mjs", import.meta.url).pathname], { encoding: "utf8" });
  // sample-house rows: copies pieces boards cost bound gap ffd alone ms
  const isHouseRow = (l) => /^\s+[124]\s+\d+\s+\d+\s+\d/.test(l);
  const house = out.split("\n").filter(isHouseRow).map((l) => l.trim().split(/\s+/));
  assert.equal(house.length, 3, out);
  const html = read("vs-ordering-lumber-by-hand.html");
  const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
  const rows = [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((t) => [...t[1].matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map((c) => c[1]));
  assert.deepEqual(rows, house.map(([copies, , boards, cost, bound, , ffd, alone]) =>
    [`${copies} (${boards} boards)`, cost, bound, `${ffd} (${pct(+ffd, +cost)})`, `${alone} (${pct(+alone, +cost)})`]));
  const [one] = house;
  assert.ok(html.includes(`sits ${one[5]} above its lower bound`), "FAQ: gap");
  assert.ok(html.includes(`costs ${one[7]} against ${one[3]}, ${pct(+one[7], +one[3]).slice(1)} more`), "FAQ: one board per piece");
  assert.ok(html.includes(`it cost ${pct(+one[6], +one[3]).slice(1)} more than the shipped order`), "FAQ: first-fit");
  const maxGap = Math.max(...house.map((r) => parseFloat(r[5])));
  for (const f of ["vs-ordering-lumber-by-hand.html", "vs-stud-per-foot-rule.html"]) {
    const within = [...read(f).matchAll(/within (\d+\.\d+)% of (the|its) linear-programming (lower )?bound/g)].map((m) => +m[1]);
    assert.ok(within.length >= 1 && within.every((w) => w >= maxGap), `${f}: ${within} vs ${maxGap}`);
  }
  // README: the fenced block after "`node bench.mjs` measures the optimiser" is that output, less the ms column.
  const readme = read("README.md");
  const block = readme.slice(readme.indexOf("`node bench.mjs` measures the optimiser")).split("```")[1];
  const strip = (t) => t.trim().split("\n").map((l) => (isHouseRow(l) ? l.replace(/\s+\d+\s*$/, "") : l.trimEnd()));
  assert.deepEqual(strip(block), strip(out));
  assert.ok(read("llms.txt").includes(`order cost ${one[3]} against a lower bound of ${one[4]}`), "llms.txt: sample house");
});

test("README advanced-framing table on the example house matches takeoff().summary", () => {
  const options = { standard: undefined, "two-stud corners": { twoStudCorners: true }, "ladder tees": { ladderTees: true }, both: { twoStudCorners: true, ladderTees: true } };
  const readme = read("README.md");
  for (const [name, advanced] of Object.entries(options)) {
    const s = takeoff({ ...samplePlan(), advanced }).summary;
    const cost = `$${s.cost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const row = `| ${name} | ${s.pieces} | ${s.boards} | ${s.fullHeightMembers} | ${cost} |`;
    assert.ok(readme.includes(row), row);
  }
});
