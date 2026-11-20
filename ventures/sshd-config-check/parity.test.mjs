// Replays the recorded sshd 9.6p1 runs (parity/sshd-9.6p1.json, written by
// parity/run-sshd.mjs on a machine with sshd) through the engine. No sshd is
// needed here: the record holds what sshd -t and sshd -T -C printed for each
// generated configuration and connection.
import test from "node:test";
import assert from "node:assert/strict";
import { compareAll, loadRecord } from "./parity/compare.mjs";

test("the engine agrees with real sshd -t and sshd -T -C on every recorded case", () => {
  const rec = loadRecord();
  assert.match(rec.sshd, /^OpenSSH_9\.6p1/);
  assert.ok(rec.cases.length >= 2000);
  const { diffs, checks } = compareAll(rec);
  assert.ok(checks > 80000, `${checks} checks`);
  assert.deepEqual(diffs.slice(0, 5), [], `${diffs.length} disagreements; run node parity/compare.mjs`);
});

test("the record covers both verdicts and Match-dependent results", () => {
  const rec = loadRecord();
  const fail = rec.cases.filter((c) => !c.starts);
  assert.ok(fail.length > 400 && rec.cases.length - fail.length > 1000);
  for (const kind of ["extra arguments", "not allowed within a Match block", "Invalid Match address", "bad PermitTunnel argument", "integer value invalid", "invalid time value", "Bad configuration option"]) {
    assert.ok(fail.some((c) => c.error.includes(kind)), kind);
  }
  // Some configurations give different connections different values.
  const varies = rec.cases.filter((c) => c.starts && new Set(c.conns.map((x) => JSON.stringify(x.settings))).size > 1);
  assert.ok(varies.length > 300, `${varies.length}`);
});
