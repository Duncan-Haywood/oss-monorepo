// Every CLI report flag on four plan shapes (the example, one wall, no openings, tiny and huge walls)
// must finish without a raw JavaScript error or a hang. Found no defect when first run (2026-11-05);
// kept as a regression net for the 30 flags. Invented plans only.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir, availableParallelism } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "cli.mjs");
const example = JSON.parse(spawnSync("node", [cli, "--example"], { encoding: "utf8" }).stdout);
const dir = mkdtempSync(join(tmpdir(), "wft-sweep-"));
const clone = (x) => JSON.parse(JSON.stringify(x));
const shapes = {
  example,
  oneWall: { ...clone(example), walls: [{ ...clone(example.walls[0]), openings: [], tees: [] }] },
  noOpenings: { ...clone(example), walls: example.walls.map((w) => ({ ...w, openings: [] })) },
  tiny: { ...clone(example), walls: example.walls.map((w) => ({ ...w, length: 24, openings: [], tees: [] })) },
};
const flags = ["--floor", "--deck", "--stairs", "--roof", "--fasteners", "--ventilation", "--gutters", "--dormer",
  "--eaves", "--siding", "--electrical", "--drilling", "--trim", "--flooring", "--paint", "--openings",
  "--insulation", "--drywall", "--foundation", "--sheathing", "--budget", "--gang", "--headers", "--schedule",
  "--risk", "--drawings", "--proposal", "--panel-max=12ft", "--hvac", "--plumbing", "--wall-tile",
  "--fireblock", "--sensitivity", "--pull-lists", "--orders", "--compare"];

// At most 4 children at once: on CI this file shares the runner's cores with the rest of the suite.
const LIMIT = Math.max(1, Math.min(4, availableParallelism()));

// One child run: stdout, stderr and whether it was killed for running past `ms`.
function run(args, ms) {
  return new Promise((resolve) => {
    const child = spawn("node", args);
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.setEncoding("utf8").on("data", (d) => (stdout += d));
    child.stderr.setEncoding("utf8").on("data", (d) => (stderr += d));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, ms);
    child.on("close", () => {
      clearTimeout(timer);
      resolve({ stdout, stderr, timedOut });
    });
  });
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

for (const [name, plan] of Object.entries(shapes)) {
  const file = join(dir, `${name}.json`);
  writeFileSync(file, JSON.stringify(plan));
  test(`cli flags on ${name} plan show no raw errors`, async () => {
    // The 36 runs are independent child processes, so a few run at once (perf, 2026-11-13:
    // one after another they took 12 s, almost all Node start-up). Results are checked in
    // flag order afterwards, so the first failing flag is still the one reported.
    const results = await mapLimit(flags, LIMIT, (flag) => run([cli, file, flag], 60000));
    flags.forEach((flag, i) => {
      const r = results[i];
      assert.ok(!r.timedOut, `${flag} hung`);
      const text = `${r.stdout}${r.stderr}`;
      assert.ok(!/(TypeError|RangeError|ReferenceError)|\n\s+at .*\.mjs:\d+/.test(text), `${flag} raw error: ${text.slice(0, 200)}`);
    });
  });
}
