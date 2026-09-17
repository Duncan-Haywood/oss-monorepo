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

test("run: check with no targets exits 2", async () => {
  const { exitCode, output } = await run(["check", "--example", ".env.example"]);
  assert.equal(exitCode, 2);
  assert.match(output, /Usage: node cli\.mjs check/);
});

test("run: unreadable example file exits 2 with a clear message", async () => {
  const { exitCode, output } = await run(["check", "--example", "nope.example", "src"], {
    readFile: () => { throw new Error("ENOENT"); },
  });
  assert.equal(exitCode, 2);
  assert.match(output, /Cannot read example file/);
});

// --- Real filesystem, single-file targets (no directory walk needed) -------

test("run: check against explicit files, clean (in-memory readFile)", async () => {
  const files = {
    ".env.example": "PORT=3000\nAPI_KEY=\n",
    "app.js": "const p = process.env.PORT;\nconst k = process.env.API_KEY;\n",
  };
  const { exitCode, output } = await run(["check", "--example", ".env.example", "app.js"], {
    readFile: (p) => {
      if (!(p in files)) throw new Error(`ENOENT: ${p}`);
      return files[p];
    },
    stat: async () => ({ isDirectory: () => false }),
  });
  assert.equal(exitCode, 0);
  assert.match(output, /nothing missing, nothing stale/);
});

test("run: check finds a missing variable and exits 1", async () => {
  const files = {
    ".env.example": "PORT=3000\n",
    "app.js": "const p = process.env.PORT;\nconst k = process.env.API_KEY;\n",
  };
  const { exitCode, output } = await run(["check", "--example", ".env.example", "app.js"], {
    readFile: (p) => {
      if (!(p in files)) throw new Error(`ENOENT: ${p}`);
      return files[p];
    },
    stat: async () => ({ isDirectory: () => false }),
  });
  assert.equal(exitCode, 1);
  assert.match(output, /MISSING\s+API_KEY/);
  assert.match(output, /app\.js:2/);
});

test("run: --strict also fails on an unused declared variable", async () => {
  const files = {
    ".env.example": "PORT=3000\nLEGACY=\n",
    "app.js": "const p = process.env.PORT;\n",
  };
  const lenient = await run(["check", "--example", ".env.example", "app.js"], {
    readFile: (p) => files[p],
    stat: async () => ({ isDirectory: () => false }),
  });
  assert.equal(lenient.exitCode, 0);
  assert.match(lenient.output, /UNUSED\s+LEGACY/);

  const strict = await run(["check", "--example", ".env.example", "app.js", "--strict"], {
    readFile: (p) => files[p],
    stat: async () => ({ isDirectory: () => false }),
  });
  assert.equal(strict.exitCode, 1);
});

test("run: --json emits a machine-readable report", async () => {
  const files = { ".env.example": "PORT=3000\n", "app.js": "process.env.PORT;" };
  const { exitCode, output } = await run(["check", "--example", ".env.example", "app.js", "--json"], {
    readFile: (p) => files[p],
    stat: async () => ({ isDirectory: () => false }),
  });
  assert.equal(exitCode, 0);
  const parsed = JSON.parse(output);
  assert.equal(parsed.filesScanned, 1);
  assert.deepEqual(parsed.matched, ["PORT"]);
});

// --- Real filesystem, directory walk ---------------------------------------

test("run: walks a real directory, skipping node_modules and dotdirs", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "env-drift-"));
  try {
    await fs.writeFile(path.join(dir, ".env.example"), "PORT=3000\n");
    await fs.mkdir(path.join(dir, "src"));
    await fs.writeFile(path.join(dir, "src", "app.js"), "const p = process.env.PORT;\nconst r = process.env.REGION;\n");
    await fs.mkdir(path.join(dir, "node_modules", "dep"), { recursive: true });
    await fs.writeFile(path.join(dir, "node_modules", "dep", "index.js"), "process.env.SHOULD_NOT_COUNT;");
    await fs.mkdir(path.join(dir, ".git"));
    await fs.writeFile(path.join(dir, ".git", "config.js"), "process.env.ALSO_IGNORED;");

    const { exitCode, output } = await run([
      "check", "--example", path.join(dir, ".env.example"), dir, "--json",
    ]);
    const parsed = JSON.parse(output);
    assert.equal(exitCode, 1);
    assert.deepEqual(parsed.missing.map((m) => m.name), ["REGION"]);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("run: a target that does not exist produces a clear error, exit 2", async () => {
  const { exitCode, output } = await run(["check", "--example", ".env.example", "/does/not/exist/xyz"], {
    readFile: () => "PORT=3000\n",
  });
  assert.equal(exitCode, 2);
  assert.match(output, /cannot read/);
});
