import test from "node:test";
import assert from "node:assert/strict";
import { run } from "./cli.mjs";

const CLEAN_VALUES = "replicaCount: 3\n";
const CLEAN_SCHEMA = JSON.stringify({ type: "object", properties: { replicaCount: { type: "integer", minimum: 1 } } });
const TYPO_VALUES = "replicaCont: 3\n";

function fakeReadFile(files) {
  return async (p) => {
    if (!(p in files)) throw new Error(`ENOENT: no such file, open '${p}'`);
    return files[p];
  };
}

test("--help prints usage and exits 0", async () => {
  const { exitCode, output } = await run(["--help"]);
  assert.equal(exitCode, 0);
  assert.match(output, /Usage:/);
  assert.match(output, /--strict/);
});

test("no subcommand exits 1 with usage", async () => {
  const { exitCode, output } = await run([]);
  assert.equal(exitCode, 1);
  assert.match(output, /Usage:/);
});

test("check on fully-conforming values exits 0", async () => {
  const { exitCode, output } = await run(["check", "v.yaml", "s.json"], {
    readFile: fakeReadFile({ "v.yaml": CLEAN_VALUES, "s.json": CLEAN_SCHEMA }),
  });
  assert.equal(exitCode, 0);
  assert.match(output, /0 finding/);
});

test("an undeclared field (permissive schema) exits 0 without --strict", async () => {
  const { exitCode, output } = await run(["check", "v.yaml", "s.json"], {
    readFile: fakeReadFile({ "v.yaml": TYPO_VALUES, "s.json": CLEAN_SCHEMA }),
  });
  assert.equal(exitCode, 0);
  assert.match(output, /1 finding/);
  assert.match(output, /replicaCont/);
  assert.match(output, /Re-run with --strict/);
});

test("an undeclared field exits 1 with --strict", async () => {
  const { exitCode } = await run(["check", "v.yaml", "s.json", "--strict"], {
    readFile: fakeReadFile({ "v.yaml": TYPO_VALUES, "s.json": CLEAN_SCHEMA }),
  });
  assert.equal(exitCode, 1);
});

test("a high-severity finding (missing required) exits 1 even without --strict", async () => {
  const schema = JSON.stringify({ type: "object", properties: { x: { type: "string" } }, required: ["x"] });
  const { exitCode, output } = await run(["check", "v.yaml", "s.json"], {
    readFile: fakeReadFile({ "v.yaml": "y: 1\n", "s.json": schema }),
  });
  assert.equal(exitCode, 1);
  assert.match(output, /missing-required|required by the schema/);
});

test("--json emits parseable JSON with the same findings", async () => {
  const { exitCode, output } = await run(["check", "v.yaml", "s.json", "--json"], {
    readFile: fakeReadFile({ "v.yaml": TYPO_VALUES, "s.json": CLEAN_SCHEMA }),
  });
  assert.equal(exitCode, 0);
  const parsed = JSON.parse(output);
  assert.equal(parsed.findings.length, 1);
  assert.equal(parsed.findings[0].id, "undeclared-field");
});

test("check on a missing file exits 2", async () => {
  const { exitCode, output } = await run(["check", "missing.yaml", "s.json"], { readFile: fakeReadFile({}) });
  assert.equal(exitCode, 2);
  assert.match(output, /Error:/);
});

test("check with garbage values.yaml exits 2 with a readable error", async () => {
  const { exitCode, output } = await run(["check", "v.yaml", "s.json"], {
    readFile: fakeReadFile({ "v.yaml": "- a\n- b\n", "s.json": "{}" }),
  });
  assert.equal(exitCode, 2);
  assert.match(output, /must parse to a mapping/);
});

test("check with invalid schema JSON exits 2", async () => {
  const { exitCode, output } = await run(["check", "v.yaml", "s.json"], {
    readFile: fakeReadFile({ "v.yaml": "a: 1\n", "s.json": "not json" }),
  });
  assert.equal(exitCode, 2);
  assert.match(output, /not valid JSON/);
});

test("check with only one path argument exits 2", async () => {
  const { exitCode } = await run(["check", "v.yaml"]);
  assert.equal(exitCode, 2);
});

test("unknown subcommand exits 2", async () => {
  const { exitCode, output } = await run(["frobnicate"]);
  assert.equal(exitCode, 2);
  assert.match(output, /Unknown subcommand/);
});
