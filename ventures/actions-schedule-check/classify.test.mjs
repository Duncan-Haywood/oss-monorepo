import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  scanText,
  scanFiles,
  classifyCron,
  hasRisk,
  summaryLine,
  CRON_INVALID,
  CRON_TOO_FREQUENT,
  CRON_TOP_OF_HOUR,
} from "./classify.mjs";

const SAMPLE = `name: nightly
on:
  schedule:
    - cron: '0 3 * * *'
    - cron: "*/2 * * * *"
    - cron: 17 3 * * 1-5   # weekdays
    - cron: '0 0 * * * *'
    - cron: '61 3 * * *'
    # - cron: '0 1 * * *'
jobs:
  a:
    runs-on: ubuntu-latest
`;

test("sample yields one finding of each kind in line order", () => {
  assert.deepEqual(
    scanText(SAMPLE).map((x) => [x.line, x.type]),
    [
      [4, CRON_TOP_OF_HOUR],
      [5, CRON_TOO_FREQUENT],
      [7, CRON_INVALID],
      [8, CRON_INVALID],
    ],
  );
});

test("details name the problem", () => {
  const f = scanText(SAMPLE);
  assert.match(f[2].detail, /6 field\(s\)/);
  assert.match(f[3].detail, /minute field '61'/);
});

test("good expressions are not flagged", () => {
  for (const e of ["17 3 * * *", "*/5 * * * *", "5,35 */6 * * 1-5", "43 2 1 1 0", "30 * * * *"]) {
    assert.deepEqual(classifyCron(e), [], e);
  }
});

test("too-frequent variants", () => {
  for (const e of ["* * * * *", "*/1 * * * *", "*/4 * * * *", "0-30/3 * * * *"]) {
    assert.equal(classifyCron(e)[0][0], CRON_TOO_FREQUENT, e);
  }
});

test("bad step and empty list item are invalid", () => {
  assert.equal(classifyCron("*/0 * * * *")[0][0], CRON_INVALID);
  assert.equal(classifyCron("1,,2 * * * *")[0][0], CRON_INVALID);
});

test("scanFiles/hasRisk/summaryLine", () => {
  const findings = scanFiles([{ name: "n.yml", text: SAMPLE }]);
  assert.equal(findings[0].file, "n.yml");
  assert.ok(hasRisk(findings));
  assert.equal(
    summaryLine(findings),
    "2 cron-invalid findings, 1 cron-faster-than-5-minutes finding, 1 cron-top-of-hour finding.",
  );
  assert.equal(summaryLine([]), "No findings.");
});

test("parity: classify.mjs and check.py agree on the same workflow", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "schedule-parity-"));
  try {
    mkdirSync(path.join(dir, ".github", "workflows"), { recursive: true });
    writeFileSync(path.join(dir, ".github", "workflows", "n.yml"), SAMPLE);
    const out = execFileSync(
      "python3",
      [new URL("./check.py", import.meta.url).pathname, dir, "--format", "json"],
      { encoding: "utf8" },
    );
    const strip = ({ line, type, detail, remediation }) => ({ line, type, detail, remediation });
    // check.py reports findings in file order; both ports do.
    assert.deepEqual(scanText(SAMPLE).map(strip), JSON.parse(out).map(strip));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
