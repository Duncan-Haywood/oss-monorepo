import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, unlinkSync } from "node:fs";
import { run } from "./cli.mjs";

test("no args prints help and exits 1", () => {
  const { exitCode, output } = run([]);
  assert.equal(exitCode, 1);
  assert.match(output, /Usage:/);
});

test("--help prints help and exits 0", () => {
  const { exitCode, output } = run(["--help"]);
  assert.equal(exitCode, 0);
  assert.match(output, /Usage:/);
});

test("states lists jurisdictions as a table", () => {
  const { exitCode, output } = run(["states"]);
  assert.equal(exitCode, 0);
  assert.match(output, /Colorado \| yes/);
  assert.match(output, /Texas \| no/);
});

test("states --json returns parseable JSON with 51 entries", () => {
  const { exitCode, output } = run(["states", "--json"]);
  assert.equal(exitCode, 0);
  const parsed = JSON.parse(output);
  assert.equal(parsed.length, 51);
});

test("scan with no text errors with exit 2", () => {
  const { exitCode, output } = run(["scan"]);
  assert.equal(exitCode, 2);
  assert.match(output, /Usage:/);
});

test("scan detects a range and exits 0 when the selected state is covered", () => {
  const { exitCode, output } = run(["scan", "$60,000 - $80,000 per year", "--states", "CO"]);
  assert.equal(exitCode, 0);
  assert.match(output, /RANGE/);
  assert.match(output, /appears to have one/);
});

test("scan exits 1 when a selected range-required state's text has no range", () => {
  const { exitCode, output } = run(["scan", "Great opportunity, apply now!", "--states", "Colorado,Texas"]);
  assert.equal(exitCode, 1);
  assert.match(output, /none was detected/);
  assert.match(output, /no state-level posting-range requirement/);
});

test("scan --json returns the full checkPosting result", () => {
  const { exitCode, output } = run(["scan", "$50,000-$70,000", "--states", "NY", "--json"]);
  assert.equal(exitCode, 0);
  const parsed = JSON.parse(output);
  assert.equal(parsed.scan.classification, "range");
  assert.equal(parsed.covered[0].state, "New York");
});

test("scan --file reads posting text from disk", () => {
  const path = new URL("./__tmp-posting.txt", import.meta.url);
  writeFileSync(path, "This role pays $90,000 to $110,000 annually.");
  try {
    const { exitCode, output } = run(["scan", "--file", path.pathname, "--states", "CA"]);
    assert.equal(exitCode, 0);
    assert.match(output, /RANGE/);
  } finally {
    unlinkSync(path);
  }
});

test("scan --file on a missing path errors with exit 2, not a crash", () => {
  const { exitCode, output } = run(["scan", "--file", "/no/such/file.txt"]);
  assert.equal(exitCode, 2);
  assert.match(output, /Error reading --file/);
});

test("an unrecognized state errors with exit 2", () => {
  const { exitCode, output } = run(["scan", "$1", "--states", "Narnia"]);
  assert.equal(exitCode, 2);
  assert.match(output, /Unrecognized US state/);
});

test("unknown subcommand errors with exit 2", () => {
  const { exitCode, output } = run(["bogus"]);
  assert.equal(exitCode, 2);
  assert.match(output, /Unknown subcommand/);
});
