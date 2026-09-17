import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

function withRepo(files, fn) {
  const dir = mkdtempSync(join(tmpdir(), "atpc-"));
  try {
    mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
    for (const [name, text] of Object.entries(files)) {
      writeFileSync(join(dir, ".github", "workflows", name), text);
    }
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("check.mjs --no-network --format json reports top-level classification with no fetch", () => {
  withRepo(
    { "ci.yml": "jobs:\n  x:\n    steps:\n      - uses: actions/checkout@8f152de45cc393bb48ce5d89d36b731f54556e65\n      - uses: some-org/tool@main\n" },
    (dir) => {
      const out = execFileSync("node", [new URL("./check.mjs", import.meta.url).pathname, dir, "--no-network", "--format", "json"], {
        encoding: "utf8",
      });
      const result = JSON.parse(out);
      assert.equal(result.checkedTransitive, false);
      assert.equal(result.reports[0].findings.length, 2);
    },
  );
});

test("check.mjs exits 1 when no workflow files exist", () => {
  const dir = mkdtempSync(join(tmpdir(), "atpc-empty-"));
  try {
    assert.throws(() => {
      execFileSync("node", [new URL("./check.mjs", import.meta.url).pathname, dir, "--no-network"], { encoding: "utf8" });
    }, (err) => err.status === 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("check.mjs --help prints usage and exits 0", () => {
  const out = execFileSync("node", [new URL("./check.mjs", import.meta.url).pathname, "--help"], { encoding: "utf8" });
  assert.match(out, /Usage: node check\.mjs/);
});

test("check.mjs text format lists findings without crashing on a clean repo", () => {
  withRepo(
    { "ci.yml": "jobs:\n  x:\n    steps:\n      - run: echo hi\n" },
    (dir) => {
      const out = execFileSync("node", [new URL("./check.mjs", import.meta.url).pathname, dir, "--no-network"], { encoding: "utf8" });
      assert.match(out, /no third-party `uses:` references found/);
    },
  );
});
