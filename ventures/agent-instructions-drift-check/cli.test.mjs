import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { run } from "./cli.mjs";

async function withFixture(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "agent-instructions-drift-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("--help exits 0 and prints usage", async () => {
  const { exitCode, output } = await run(["--help"]);
  assert.equal(exitCode, 0);
  assert.match(output, /Usage:/);
});

test("no subcommand exits 1", async () => {
  const { exitCode } = await run([]);
  assert.equal(exitCode, 1);
});

test("unknown subcommand exits 2", async () => {
  const { exitCode, output } = await run(["frobnicate", "AGENTS.md"]);
  assert.equal(exitCode, 2);
  assert.match(output, /Unknown subcommand/);
});

test("unreadable instructions file exits 2", async () => {
  const { exitCode, output } = await run(["check", "/no/such/file.md"]);
  assert.equal(exitCode, 2);
  assert.match(output, /Cannot read/);
});

test("clean instructions file (no drift) exits 0", async () => {
  await withFixture(async (dir) => {
    await writeFile(path.join(dir, "README.md"), "# hi");
    await writeFile(
      path.join(dir, "AGENTS.md"),
      "Read [`README.md`](README.md) first.\n",
    );
    const { exitCode, output } = await run(["check", path.join(dir, "AGENTS.md"), "--root", dir]);
    assert.equal(exitCode, 0);
    assert.match(output, /nothing broken/);
  });
});

test("a broken file reference exits 1 and names the path and line", async () => {
  await withFixture(async (dir) => {
    await writeFile(
      path.join(dir, "AGENTS.md"),
      "Line one.\nRun `python3 scripts/ghost.py` to set up.\n",
    );
    const { exitCode, output } = await run(["check", path.join(dir, "AGENTS.md"), "--root", dir]);
    assert.equal(exitCode, 1);
    assert.match(output, /MISSING FILE\s+scripts\/ghost\.py/);
    assert.match(output, /line 2/);
  });
});

test("an npm script reference missing from package.json exits 1", async () => {
  await withFixture(async (dir) => {
    await writeFile(path.join(dir, "package.json"), JSON.stringify({ scripts: { build: "tsc" } }));
    await writeFile(path.join(dir, "AGENTS.md"), "Before pushing, run `npm run release`.\n");
    const { exitCode, output } = await run(["check", path.join(dir, "AGENTS.md"), "--root", dir]);
    assert.equal(exitCode, 1);
    assert.match(output, /MISSING SCRIPT\s+npm run release/);
  });
});

test("no package.json present: script checking is skipped, not a failure", async () => {
  await withFixture(async (dir) => {
    await writeFile(path.join(dir, "AGENTS.md"), "Run `npm run release`.\n");
    const { exitCode, output } = await run(["check", path.join(dir, "AGENTS.md"), "--root", dir]);
    assert.equal(exitCode, 0);
    assert.match(output, /script refs not checked/);
  });
});

test("a bare pytest footgun in a fenced block exits 1", async () => {
  await withFixture(async (dir) => {
    await writeFile(path.join(dir, "AGENTS.md"), ["Run this:", "```", "pytest -q", "```"].join("\n"));
    const { exitCode, output } = await run(["check", path.join(dir, "AGENTS.md"), "--root", dir]);
    assert.equal(exitCode, 1);
    assert.match(output, /FOOTGUN\s+pytest/);
  });
});

test("--json emits machine-readable output with the same verdict", async () => {
  await withFixture(async (dir) => {
    await writeFile(path.join(dir, "AGENTS.md"), "See `docs/ghost.md`.\n");
    const { exitCode, output } = await run(["check", path.join(dir, "AGENTS.md"), "--root", dir, "--json"]);
    assert.equal(exitCode, 1);
    const parsed = JSON.parse(output);
    assert.deepEqual(parsed.fileDiff.missing.map((m) => m.ref), ["docs/ghost.md"]);
  });
});

// Dogfood: run the real CLI against this repo's own top-level AGENTS.md, from
// the real repo root, and confirm one specific reference that has always
// been there resolves correctly. This is deliberately a narrow assertion,
// not "zero drift" -- AGENTS.md is edited by many sessions, and pinning this
// test to its exact drift count would make it fail on unrelated AGENTS.md
// edits elsewhere in the fleet, exactly the "a guard nobody trusts" failure
// mode CLAUDE.md itself documents at length. What is stable is that
// PRODUCT_PLAYBOOK.md, named directly in AGENTS.md, actually exists.
test("dogfood: this repo's own AGENTS.md resolves a known-real reference against the real repo root", async () => {
  const repoRoot = new URL("../../", import.meta.url).pathname;
  const { exitCode, output } = await run(["check", path.join(repoRoot, "AGENTS.md"), "--root", repoRoot, "--json"]);
  const parsed = JSON.parse(output);
  const matchedPaths = parsed.fileDiff.matched.map((m) => m.ref);
  assert.ok(matchedPaths.includes("portfolio/DIRECTION.md"), `expected portfolio/DIRECTION.md to resolve; got matched=${JSON.stringify(matchedPaths)}`);
  assert.ok([0, 1].includes(exitCode)); // real repo drift is a fact to observe here, not to assert away
});
