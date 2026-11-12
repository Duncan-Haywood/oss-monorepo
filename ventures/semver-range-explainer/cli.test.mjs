import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { projectReport } from "./cli.mjs";

const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));
const run = (args, input) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", input });

test("explains a range and the version npm would pick from npm view JSON on stdin", () => {
  const r = run(["^1.2.0", "-"], '["1.1.0","1.2.0","1.8.3","1.9.0-rc.1","2.0.0"]');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Comparators: >=1\.2\.0 <2\.0\.0-0/);
  assert.match(r.stdout, /Highest match \(what npm installs from this list\): 1\.8\.3/);
  assert.match(r.stdout, /1\.9\.0-rc\.1 .*npm skips it/);
});

test("--compare gives witnesses, --json parses, invalid range exits 2", () => {
  const r = run(["~1.2.5", "--compare", "^1.2"]);
  assert.match(r.stdout, /range 2 allows, range 1 allows: no, e\.g\. 1\.2\.0/);
  const j = JSON.parse(run(["^1", "1.5.0", "--json"]).stdout);
  assert.equal(j.max, "1.5.0");
  assert.equal(run(["latest"]).status, 2);
  assert.equal(run(["^1.2.3-rc.1 || *", "--strict"]).status, 1);
});

test("--project checks package.json ranges against package-lock.json", () => {
  const dir = mkdtempSync(join(tmpdir(), "semver-cli-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { a: "^1.2.0", b: ">=2", c: "github:x/y" }, devDependencies: { d: "~3.1.0" } }));
  writeFileSync(join(dir, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/a": { version: "1.4.0" }, "node_modules/d": { version: "3.2.0" } } }));
  const rep = projectReport(dir);
  const by = Object.fromEntries(rep.rows.map((r) => [r.name, r]));
  assert.equal(by.a.lockOk, true);
  assert.equal(by.d.lockOk, false);
  assert.ok(by.b.findings.some((f) => f.code === "no-upper-bound"));
  assert.equal(by.c.skipped, "not a registry semver range");
  const out = execFileSync(process.execPath, [CLI, "--project", dir], { encoding: "utf8" });
  assert.match(out, /d@~3\.1\.0 \(devDependencies\)  LOCKED 3\.2\.0 DOES NOT SATISFY/);
  assert.equal(run(["--project", dir, "--strict"]).status, 1);
});
