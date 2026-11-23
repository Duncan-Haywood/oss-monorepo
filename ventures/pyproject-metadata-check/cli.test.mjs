import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));
const run = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "ppc-"));
  for (const [p, t] of Object.entries(files)) writeFileSync(join(root, p), t);
  return root;
}
const GOOD = '[build-system]\nrequires = ["hatchling"]\nbuild-backend = "hatchling.build"\n[project]\nname = "demo"\nversion = "1.0"\ndescription = "Demo."\nreadme = "README.md"\nrequires-python = ">=3.9"\nlicense = "MIT"\nlicense-files = ["LICENSE"]\n';

test("a clean project exits 0 and prints the summary", () => {
  const r = run([fixture({ "pyproject.toml": GOOD, "README.md": "# d", LICENSE: "MIT" })]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /^demo 1\.0 · hatchling\.build · Python >=3\.9 · 0 dependencies/);
  assert.match(r.stdout, /0 high, 0 medium, 0 low/);
});

test("reads the folder's files: a missing readme and an unmatched license-files pattern fail", () => {
  const root = fixture({ "pyproject.toml": GOOD });
  const r = run([root]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /pyproject\.toml:8: \[high\] readme-missing/);
  assert.match(r.stdout, /license-files-no-match/);
  assert.equal(run([root, "--no-files"]).status, 0);
});

test("--fail-on, --json and --metadata", () => {
  const root = fixture({ "pyproject.toml": GOOD.replace(">=3.9", ">=3.9,<3.14"), "README.md": "", LICENSE: "" });
  assert.equal(run([root]).status, 0);
  assert.equal(run([root, "--fail-on", "medium"]).status, 1);
  assert.equal(run([root, "--fail-on", "none"]).status, 0);
  const j = JSON.parse(run([join(root, "pyproject.toml"), "--json"]).stdout);
  assert.equal(j.findings[0].id, "requires-python-cap");
  assert.match(run([root, "--metadata"]).stdout, /Requires-Python: >=3\.9,<3\.14/);
  assert.equal(run([root, "--fail-on", "bogus"]).status, 2);
  assert.equal(run([join(root, "nope")]).status, 2);
});
