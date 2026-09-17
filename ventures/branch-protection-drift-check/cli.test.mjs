import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { parseArgs, renderText } from "./cli.mjs";
import { compare } from "./engine.mjs";

test("parseArgs reads flags and rejects unknown ones", () => {
  const args = parseArgs(["--actual", "a.json", "--policy", "p.json", "--format", "json", "--fail-on-drift"]);
  assert.equal(args.actual, "a.json");
  assert.equal(args.policy, "p.json");
  assert.equal(args.format, "json");
  assert.equal(args.failOnDrift, true);
  assert.throws(() => parseArgs(["--bogus"]), /Unrecognized argument/);
});

test("renderText names each drifted rule and skips not-policed ones", () => {
  const rows = compare({ enforce_admins: { enabled: false } }, { enforce_admins: true });
  const text = renderText(rows, { enforce_admins: { enabled: false } });
  assert.match(text, /DRIFT/);
  assert.match(text, /Enforce for administrators/);
  assert.match(text, /Not policed \(policy is silent on\).*Allow force pushes/);
  // Unpoliced rules are named once, in the trailing summary — never given
  // their own DRIFT/ok/stronger line, which would imply a verdict the
  // policy never stated.
  const scoredLines = text.split("\n").filter((l) => /^(DRIFT|ok|stronger)/.test(l));
  assert.ok(scoredLines.every((l) => !l.includes("Allow force pushes")));
});

test("end-to-end CLI run: compliant repo exits 0, drifted repo exits 2 with --fail-on-drift", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpdc-"));
  const actualCompliant = join(dir, "actual-ok.json");
  const actualDrifted = join(dir, "actual-drift.json");
  const policy = join(dir, "policy.txt");

  writeFileSync(actualCompliant, JSON.stringify({ enforce_admins: { enabled: true } }));
  writeFileSync(actualDrifted, JSON.stringify({ enforce_admins: { enabled: false } }));
  writeFileSync(policy, "enforce_admins: true\n");

  const okOut = execFileSync("node", ["cli.mjs", "--actual", actualCompliant, "--policy", policy, "--fail-on-drift"], {
    cwd: new URL(".", import.meta.url).pathname,
    encoding: "utf8",
  });
  assert.match(okOut, /No drift/);

  assert.throws(() => {
    execFileSync("node", ["cli.mjs", "--actual", actualDrifted, "--policy", policy, "--fail-on-drift"], {
      cwd: new URL(".", import.meta.url).pathname,
      encoding: "utf8",
    });
  }, /Command failed/);

  rmSync(dir, { recursive: true, force: true });
});

test("CLI --format json emits parseable JSON with the same rows the engine produces directly", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpdc-"));
  const actual = join(dir, "actual.json");
  const policy = join(dir, "policy.json");
  writeFileSync(actual, JSON.stringify({ allow_force_pushes: { enabled: true } }));
  writeFileSync(policy, JSON.stringify({ allow_force_pushes: false }));

  const out = execFileSync("node", ["cli.mjs", "--actual", actual, "--policy", policy, "--format", "json"], {
    cwd: new URL(".", import.meta.url).pathname,
    encoding: "utf8",
  });
  const parsed = JSON.parse(out);
  assert.equal(parsed.unprotected, false);
  assert.equal(parsed.rows.find((r) => r.key === "allow_force_pushes").status, "drift");

  rmSync(dir, { recursive: true, force: true });
});

test("CLI with no arguments prints usage and exits 1", () => {
  assert.throws(() => {
    execFileSync("node", ["cli.mjs"], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" });
  }, /Command failed/);
});
