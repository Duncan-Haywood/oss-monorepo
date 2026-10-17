import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONTROLS, sampleAnswers } from "./calc.mjs";

const cli = new URL("./cli.mjs", import.meta.url).pathname;
const withFile = (t) => { const d = mkdtempSync(join(tmpdir(), "soc2-")); const f = join(d, "a.csv"); writeFileSync(f, t); return f; };
const csv = (o) => Object.entries(o).map(([k, v]) => `${k},${v}`).join("\n");

test("exits 1 while weight-3 controls are missing and prints the roadmap", () => {
  const r = spawnSync("node", [cli, withFile(csv(sampleAnswers()))], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Readiness \d/);
  assert.match(r.stdout, /1\. \[w/);
});

test("exits 0 when no blocker remains", () => {
  const all = Object.fromEntries(CONTROLS.map((c) => [c.id, "yes"]));
  assert.equal(spawnSync("node", [cli, withFile(csv(all))], { encoding: "utf8" }).status, 0);
});

test("--json parses; --list lists; usage and bad JSON exit 2", () => {
  assert.ok(JSON.parse(spawnSync("node", [cli, withFile(csv(sampleAnswers())), "--json"], { encoding: "utf8" }).stdout).gaps.length > 0);
  assert.match(spawnSync("node", [cli, "--list"], { encoding: "utf8" }).stdout, /ac-mfa/);
  assert.equal(spawnSync("node", [cli], { encoding: "utf8" }).status, 2);
  assert.equal(spawnSync("node", [cli, withFile("{oops")], { encoding: "utf8" }).status, 2);
});
