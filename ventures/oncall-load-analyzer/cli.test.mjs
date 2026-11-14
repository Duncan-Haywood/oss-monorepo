import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sampleCsv } from "./calc.mjs";

const cli = new URL("./cli.mjs", import.meta.url).pathname;
const withFile = (text) => { const d = mkdtempSync(join(tmpdir(), "oncall-")); const f = join(d, "i.csv"); writeFileSync(f, text); return f; };

test("exits 1 and names the overloaded person on the sample", () => {
  const r = spawnSync("node", [cli, withFile(sampleCsv())], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /! Priya/);
});

test("--json is parseable and a missing file is a usage error", () => {
  const r = spawnSync("node", [cli, withFile(sampleCsv()), "--json"], { encoding: "utf8" });
  assert.ok(JSON.parse(r.stdout).summary.pages > 0);
  assert.equal(spawnSync("node", [cli], { encoding: "utf8" }).status, 2);
});

test("a CSV with no responder column exits 2 with the reason", () => {
  const r = spawnSync("node", [cli, withFile("created_at,title\n2026-01-05,x")], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /No responder column/);
});

// Red-team 2026-11-14: --tz must move the night window, wherever it sits, and a
// value the CLI cannot read must be refused, not silently replaced by UTC.
const firstLine = (args) => spawnSync("node", [cli, ...args], { encoding: "utf8" }).stdout.split("\n")[0];

test("--tz shifts the night share, before or after the file, in either spelling", () => {
  const f = withFile(sampleCsv());
  const utc = firstLine([f]);
  assert.match(utc, /; 45% at night/);
  assert.equal(firstLine([f, "--tz", "0"]), utc);
  assert.match(firstLine([f, "--tz", "-5"]), /; 36% at night/);
  assert.match(firstLine(["--tz", "-5", f]), /; 36% at night/);
  assert.match(firstLine([`--tz=-5`, f]), /; 36% at night/);
});

test("an unreadable or impossible --tz is a usage error, not UTC", () => {
  const f = withFile(sampleCsv());
  for (const bad of [["--tz", "abc"], ["--tz"], ["--tz=EST"], ["--tz", "99"]]) {
    const r = spawnSync("node", [cli, f, ...bad], { encoding: "utf8" });
    assert.equal(r.status, 2, bad.join(" "));
    assert.match(r.stderr, /--tz/);
  }
});

test("exits 0 when nobody is overloaded", () => {
  const f = withFile("created_at,responder,title\n2026-01-05T10:00:00Z,ana,x\n2026-01-06T10:00:00Z,bo,y\n");
  assert.equal(spawnSync("node", [cli, f], { encoding: "utf8" }).status, 0);
});

test("with no --tz the night window is read in UTC", () => {
  // 21:30 UTC on a Monday is an evening page in UTC but a night page one hour east.
  const f = withFile("created_at,responder,title\n2026-01-05T21:30:00Z,ana,x\n");
  assert.match(firstLine([f]), /; 0% at night/);
  assert.match(firstLine([f, "--tz", "1"]), /; 100% at night/);
});
