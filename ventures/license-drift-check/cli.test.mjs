import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { run, buildSnapshot } from "./cli.mjs";

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

test("run: diff exits 0 and reports clean when nothing changed", async () => {
  const files = {
    "baseline.json": JSON.stringify([{ name: "x", version: "1.0.0", license: "MIT" }]),
    "current.json": JSON.stringify([{ name: "x", version: "1.1.0", license: "MIT" }]),
  };
  const { exitCode, output } = await run(["diff", "baseline.json", "current.json"], {
    readFile: (p) => files[p],
  });
  assert.equal(exitCode, 0);
  assert.match(output, /No license changes/);
});

test("run: diff exits 1 and names the package when a license changed", async () => {
  const files = {
    "baseline.json": JSON.stringify([{ name: "terraform-like", version: "1.5.0", license: "MPL-2.0" }]),
    "current.json": JSON.stringify([{ name: "terraform-like", version: "1.6.0", license: "BUSL-1.1" }]),
  };
  const { exitCode, output } = await run(["diff", "baseline.json", "current.json"], {
    readFile: (p) => files[p],
  });
  assert.equal(exitCode, 1);
  assert.match(output, /CHANGED\s+terraform-like/);
  assert.match(output, /MPL-2\.0/);
  assert.match(output, /BUSL-1\.1/);
});

test("run: diff --json emits a parseable report", async () => {
  const files = {
    "b.json": JSON.stringify([{ name: "x", version: "1.0.0", license: "MIT" }]),
    "c.json": JSON.stringify([{ name: "x", version: "1.0.0", license: "GPL-3.0" }]),
  };
  const { exitCode, output } = await run(["diff", "b.json", "c.json", "--json"], { readFile: (p) => files[p] });
  assert.equal(exitCode, 1);
  const parsed = JSON.parse(output);
  assert.equal(parsed.changed.length, 1);
  assert.equal(parsed.changed[0].name, "x");
});

test("run: diff --ignore suppresses a specific package from the exit code", async () => {
  const files = {
    "b.json": JSON.stringify([{ name: "accepted", version: "1.0.0", license: "MIT" }]),
    "c.json": JSON.stringify([{ name: "accepted", version: "2.0.0", license: "GPL-3.0" }]),
  };
  const { exitCode } = await run(["diff", "b.json", "c.json", "--ignore", "accepted"], { readFile: (p) => files[p] });
  assert.equal(exitCode, 0);
});

test("run: diff with a missing file exits 2", async () => {
  const { exitCode, output } = await run(["diff", "missing.json", "also-missing.json"], {
    readFile: async () => {
      throw new Error("ENOENT: no such file");
    },
  });
  assert.equal(exitCode, 2);
  assert.match(output, /Error:/);
});

test("run: diff with no files exits 2 with a usage message", async () => {
  const { exitCode, output } = await run(["diff"]);
  assert.equal(exitCode, 2);
  assert.match(output, /Usage: node cli\.mjs diff/);
});

test("run: snapshot writes JSON via an injected scanner", async () => {
  const writes = {};
  const { exitCode, output } = await run(["snapshot", "--out", "out.json"], {
    scan: async () => [{ name: "x", version: "1.0.0", license: "MIT" }],
    writeFile: async (p, content) => {
      writes[p] = content;
    },
  });
  assert.equal(exitCode, 0);
  assert.match(output, /Wrote 1 package/);
  assert.match(writes["out.json"], /"name": "x"/);
});

test("run: snapshot with no --out prints JSON to stdout", async () => {
  const { exitCode, output } = await run(["snapshot"], {
    scan: async () => [{ name: "x", version: "1.0.0", license: "MIT" }],
  });
  assert.equal(exitCode, 0);
  const parsed = JSON.parse(output);
  assert.deepEqual(parsed, [{ name: "x", version: "1.0.0", license: "MIT" }]);
});

test("run: snapshot surfaces a scan error as exit 2", async () => {
  const { exitCode, output } = await run(["snapshot"], {
    scan: async () => {
      throw new Error("cannot read node_modules: ENOENT");
    },
  });
  assert.equal(exitCode, 2);
  assert.match(output, /Error:/);
});

// buildSnapshot itself, against a real temp directory -- exercises the
// top-level + one-level-into-@scope node_modules walk with no injection.
test("buildSnapshot: reads plain and scoped package.json license fields from a real directory", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "license-drift-check-"));
  try {
    await fs.mkdir(path.join(dir, "left-pad"));
    await fs.writeFile(
      path.join(dir, "left-pad", "package.json"),
      JSON.stringify({ name: "left-pad", version: "1.3.0", license: "WTFPL" }),
    );
    await fs.mkdir(path.join(dir, "@scope", "widget"), { recursive: true });
    await fs.writeFile(
      path.join(dir, "@scope", "widget", "package.json"),
      JSON.stringify({ name: "@scope/widget", version: "2.0.0", licenses: [{ type: "MIT" }] }),
    );
    // A directory with no package.json (or an unreadable one) is skipped, not fatal.
    await fs.mkdir(path.join(dir, ".bin"));

    const snapshot = await buildSnapshot(dir);
    assert.deepEqual(snapshot, [
      { name: "@scope/widget", version: "2.0.0", license: "MIT" },
      { name: "left-pad", version: "1.3.0", license: "WTFPL" },
    ]);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("buildSnapshot: a missing directory raises a clear error", async () => {
  await assert.rejects(() => buildSnapshot("/does/not/exist/at/all"), /cannot read/);
});
