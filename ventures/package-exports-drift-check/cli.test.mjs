import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { run } from "./cli.mjs";

test("run: --help prints usage and exits 0", async () => {
  const { exitCode, output } = await run(["--help"]);
  assert.equal(exitCode, 0);
  assert.match(output, /Usage:/);
});

test("run: no subcommand exits 1", async () => {
  const { exitCode } = await run([]);
  assert.equal(exitCode, 1);
});

test("run: unknown subcommand exits 2", async () => {
  const { exitCode, output } = await run(["bogus"]);
  assert.equal(exitCode, 2);
  assert.match(output, /Unknown subcommand/);
});

test("run: unreadable package.json exits 2 with a clear message", async () => {
  const { exitCode, output } = await run(["check", "nope/package.json"], {
    readFile: () => { throw new Error("ENOENT"); },
  });
  assert.equal(exitCode, 2);
  assert.match(output, /Cannot read nope\/package\.json/);
});

test("run: invalid JSON exits 2 with a clear message", async () => {
  const { exitCode, output } = await run(["check"], { readFile: () => "{not json" });
  assert.equal(exitCode, 2);
  assert.match(output, /not valid JSON/);
});

test("run: no exports field exits 0 with a clear message", async () => {
  const { exitCode, output } = await run(["check"], { readFile: () => '{"name":"x"}' });
  assert.equal(exitCode, 0);
  assert.match(output, /nothing to check/);
});

test("run: all targets exist, exits 0", async () => {
  const { exitCode, output } = await run(["check"], {
    readFile: () => JSON.stringify({ exports: { ".": "./dist/index.js" } }),
    stat: async () => ({}),
  });
  assert.equal(exitCode, 0);
  assert.match(output, /nothing missing/);
});

test("run: a missing target exits 1 and names the subpath and path", async () => {
  const { exitCode, output } = await run(["check"], {
    readFile: () => JSON.stringify({ exports: { ".": "./dist/index.js", "./feature": "./dist/feature.js" } }),
    stat: async (p) => {
      if (String(p).endsWith("feature.js")) throw new Error("ENOENT");
      return {};
    },
  });
  assert.equal(exitCode, 1);
  assert.match(output, /MISSING\s+\.\/feature/);
  assert.match(output, /dist\/feature\.js/);
});

test("run: --json emits a machine-readable report, including wildcard/external skips", async () => {
  const { exitCode, output } = await run(["check", "--json"], {
    readFile: () => JSON.stringify({
      exports: {
        ".": "./dist/index.js",
        "./features/*": "./dist/features/*.js",
        "./compat": "other-pkg/compat",
      },
    }),
    stat: async () => ({}),
  });
  assert.equal(exitCode, 0);
  const parsed = JSON.parse(output);
  assert.equal(parsed.missing.length, 0);
  assert.equal(parsed.matched.length, 1);
  assert.equal(parsed.wildcardSkipped.length, 1);
  assert.equal(parsed.externalSkipped.length, 1);
});

test("run: package.json path resolves targets relative to its own directory, on a real filesystem", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "exports-drift-"));
  try {
    await fs.mkdir(path.join(dir, "dist"));
    await fs.writeFile(path.join(dir, "dist", "index.js"), "module.exports = {};");
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ exports: { ".": "./dist/index.js", "./missing": "./dist/missing.js" } }),
    );

    const { exitCode, output } = await run(["check", path.join(dir, "package.json"), "--json"]);
    const parsed = JSON.parse(output);
    assert.equal(exitCode, 1);
    assert.deepEqual(parsed.matched.map((e) => e.target), ["./dist/index.js"]);
    assert.deepEqual(parsed.missing.map((e) => e.target), ["./dist/missing.js"]);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("run: duplicate target across two conditions is checked once and reported once per subpath", async () => {
  const { exitCode, output } = await run(["check", "--json"], {
    readFile: () => JSON.stringify({ exports: { ".": { import: "./dist/index.js", require: "./dist/index.js" } } }),
    stat: async () => { throw new Error("ENOENT"); },
  });
  assert.equal(exitCode, 1);
  const parsed = JSON.parse(output);
  assert.equal(parsed.missing.length, 2); // once per condition entry, same target
  assert.deepEqual(parsed.missing.map((m) => m.target), ["./dist/index.js", "./dist/index.js"]);
});
