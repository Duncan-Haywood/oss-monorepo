// Every CLI report flag on four plan shapes (the example, one wall, no openings, tiny and huge walls)
// must finish without a raw JavaScript error or a hang. Found no defect when first run (2026-11-05);
// kept as a regression net for the 30 flags. Invented plans only.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
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
  "--risk", "--drawings", "--proposal", "--panel-max=12ft"];

for (const [name, plan] of Object.entries(shapes)) {
  const file = join(dir, `${name}.json`);
  writeFileSync(file, JSON.stringify(plan));
  test(`cli flags on ${name} plan show no raw errors`, () => {
    for (const flag of flags) {
      const r = spawnSync("node", [cli, file, flag], { encoding: "utf8", timeout: 60000 });
      assert.notEqual(r.error?.code, "ETIMEDOUT", `${flag} hung`);
      const text = `${r.stdout}${r.stderr}`;
      assert.ok(!/(TypeError|RangeError|ReferenceError)|\n\s+at .*\.mjs:\d+/.test(text), `${flag} raw error: ${text.slice(0, 200)}`);
    }
  });
}
