import test from "node:test";
import assert from "node:assert/strict";
import { run } from "./cli.mjs";

test("no args prints help and exits 1", () => {
  const { exitCode, output } = run([]);
  assert.equal(exitCode, 1);
  assert.match(output, /Usage:/);
});

test("--help exits 0", () => {
  const { exitCode } = run(["--help"]);
  assert.equal(exitCode, 0);
});

test("unknown subcommand exits 2", () => {
  const { exitCode, output } = run(["bogus"]);
  assert.equal(exitCode, 2);
  assert.match(output, /Unknown subcommand/);
});

test("check with wrong arg count exits 2", () => {
  const { exitCode, output } = run(["check", "Texas"]);
  assert.equal(exitCode, 2);
  assert.match(output, /Usage:/);
});

test("check with an unrecognized state exits 2 with the error", () => {
  const { exitCode, output } = run(["check", "Nowhereland", "Texas"]);
  assert.equal(exitCode, 2);
  assert.match(output, /Error:.*Unrecognized/);
});

test("check: two one-party states exits 0", () => {
  const { exitCode, output } = run(["check", "Texas", "New York"]);
  assert.equal(exitCode, 0);
  assert.match(output, /ONE-PARTY CONSENT SUFFICIENT/);
  assert.match(output, /Texas/);
  assert.match(output, /New York/);
});

test("check: caller all-party state exits 1", () => {
  const { exitCode, output } = run(["check", "California", "Texas"]);
  assert.equal(exitCode, 1);
  assert.match(output, /ALL-PARTY CONSENT REQUIRED/);
});

test("check: recipient all-party state also exits 1 (order-independent)", () => {
  const { exitCode, output } = run(["check", "Texas", "California"]);
  assert.equal(exitCode, 1);
  assert.match(output, /ALL-PARTY CONSENT REQUIRED/);
});

test("check accepts two-letter abbreviations", () => {
  const { exitCode, output } = run(["check", "ca", "tx"]);
  assert.equal(exitCode, 1);
  assert.match(output, /California/);
});

test("check --json emits parseable JSON with the same requirement", () => {
  const { exitCode, output } = run(["check", "California", "Texas", "--json"]);
  assert.equal(exitCode, 1);
  const parsed = JSON.parse(output);
  assert.equal(parsed.requirement, "all-party");
  assert.equal(parsed.caller.state, "California");
  assert.equal(parsed.recipient.state, "Texas");
});

test("check cites the federal statute and Kearney precedent for an interstate all-party call in the text render", () => {
  const { output } = run(["check", "California", "Texas"]);
  assert.match(output, /18 U\.S\.C\. § 2511/);
  assert.match(output, /Kearney/);
});

test("states lists all 51 jurisdictions and exits 0", () => {
  const { exitCode, output } = run(["states"]);
  assert.equal(exitCode, 0);
  assert.match(output, /California/);
  assert.match(output, /District of Columbia/);
  // header + separator + 51 rows
  assert.equal(output.trim().split("\n").length, 53);
});

test("states --json emits an array of 51 entries", () => {
  const { exitCode, output } = run(["states", "--json"]);
  assert.equal(exitCode, 0);
  const parsed = JSON.parse(output);
  assert.equal(parsed.length, 51);
  assert.ok(parsed.every((r) => r.name && r.type));
});

test("script requires a valid requirement argument", () => {
  const { exitCode, output } = run(["script", "bogus"]);
  assert.equal(exitCode, 2);
  assert.match(output, /Usage:/);
});

test("script all-party prints a consent request and honours --company/--purpose", () => {
  const { exitCode, output } = run(["script", "all-party", "--company", "Acme Inc.", "--purpose", "training"]);
  assert.equal(exitCode, 0);
  assert.match(output, /Acme Inc\./);
  assert.match(output, /training/);
  assert.match(output, /consent/i);
});

test("script one-party prints a shorter courtesy notice", () => {
  const { exitCode, output } = run(["script", "one-party"]);
  assert.equal(exitCode, 0);
  assert.match(output, /may be recorded/i);
});

test("script --json wraps the requirement and script text", () => {
  const { exitCode, output } = run(["script", "all-party", "--json"]);
  assert.equal(exitCode, 0);
  const parsed = JSON.parse(output);
  assert.equal(parsed.requirement, "all-party");
  assert.match(parsed.script, /consent/i);
});
