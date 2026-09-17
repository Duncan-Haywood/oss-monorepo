import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { run, buildSnapshot, queryMarketplace, DEFAULT_EXTENSION_DIRS } from "./cli.mjs";

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

test("run: diff exits 0 when nothing changed surface", async () => {
  const files = {
    "baseline.json": JSON.stringify([{ publisher: "a", name: "b", version: "1.0.0", activationEvents: [] }]),
    "current.json": JSON.stringify([{ publisher: "a", name: "b", version: "1.1.0", activationEvents: [] }]),
  };
  const { exitCode, output } = await run(["diff", "baseline.json", "current.json"], { readFile: (p) => files[p] });
  assert.equal(exitCode, 0);
  assert.match(output, /extension\(s\) updated version only/);
});

test("run: diff exits 1 and names the extension whose surface changed", async () => {
  const files = {
    "baseline.json": JSON.stringify([{ publisher: "a", name: "b", version: "1.0.0", activationEvents: [] }]),
    "current.json": JSON.stringify([{ publisher: "a", name: "b", version: "1.0.1", activationEvents: ["*"] }]),
  };
  const { exitCode, output } = await run(["diff", "baseline.json", "current.json"], { readFile: (p) => files[p] });
  assert.equal(exitCode, 1);
  assert.match(output, /SURFACE CHANGED\s+a\.b/);
  assert.match(output, /gained-startup-activation/);
});

test("run: diff --json emits a parseable report", async () => {
  const files = {
    "b.json": JSON.stringify([{ publisher: "a", name: "b", version: "1.0.0", activationEvents: [] }]),
    "c.json": JSON.stringify([{ publisher: "a", name: "b", version: "1.0.0", activationEvents: ["*"] }]),
  };
  const { exitCode, output } = await run(["diff", "b.json", "c.json", "--json"], { readFile: (p) => files[p] });
  assert.equal(exitCode, 1);
  const parsed = JSON.parse(output);
  assert.equal(parsed.changed.length, 1);
  assert.equal(parsed.changed[0].surfaceChanged, true);
});

test("run: diff --ignore suppresses a specific extension from the exit code", async () => {
  const files = {
    "b.json": JSON.stringify([{ publisher: "a", name: "b", version: "1.0.0", activationEvents: [] }]),
    "c.json": JSON.stringify([{ publisher: "a", name: "b", version: "1.0.0", activationEvents: ["*"] }]),
  };
  const { exitCode } = await run(["diff", "b.json", "c.json", "--ignore", "a.b"], { readFile: (p) => files[p] });
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

test("run: snapshot with --dir writes JSON via an injected scanner", async () => {
  const writes = {};
  const { exitCode, output } = await run(["snapshot", "--dir", "/fake/dir", "--out", "out.json"], {
    scan: async () => [{ id: "a.b", publisher: "a", name: "b", version: "1.0.0" }],
    writeFile: async (p, content) => {
      writes[p] = content;
    },
  });
  assert.equal(exitCode, 0);
  assert.match(output, /Wrote 1 extension/);
  assert.match(writes["out.json"], /"id": "a\.b"/);
});

test("run: snapshot with no --dir and no default dir found exits 2", async () => {
  const { exitCode, output } = await run(["snapshot"], { exists: async () => false });
  assert.equal(exitCode, 2);
  assert.match(output, /no extensions directory found/);
});

test("run: snapshot auto-detects the first existing default dir", async () => {
  const { exitCode, output } = await run(["snapshot"], {
    homedir: () => "/home/u",
    exists: async (p) => p === "/home/u/.cursor/extensions",
    scan: async (dir) => {
      assert.equal(dir, "/home/u/.cursor/extensions");
      return [{ id: "a.b", publisher: "a", name: "b", version: "1.0.0" }];
    },
  });
  assert.equal(exitCode, 0);
  assert.match(output, /"id": "a\.b"/);
});

test("run: snapshot surfaces a scan error as exit 2", async () => {
  const { exitCode, output } = await run(["snapshot", "--dir", "/x"], {
    scan: async () => {
      throw new Error("cannot read /x: ENOENT");
    },
  });
  assert.equal(exitCode, 2);
  assert.match(output, /Error:/);
});

test("run: check reports a not-found extension without failing by default", async () => {
  const files = { "snap.json": JSON.stringify([{ publisher: "a", name: "gone", version: "1.0.0" }]) };
  const { exitCode, output } = await run(["check", "snap.json"], {
    readFile: (p) => files[p],
    fetchImpl: async () => ({ ok: true, json: async () => ({ results: [{ extensions: [] }] }) }),
  });
  assert.equal(exitCode, 0);
  assert.match(output, /NOT FOUND/);
  assert.match(output, /a\.gone/);
});

test("run: check --fail-on-not-found exits 1 when something is missing", async () => {
  const files = { "snap.json": JSON.stringify([{ publisher: "a", name: "gone", version: "1.0.0" }]) };
  const { exitCode } = await run(["check", "snap.json", "--fail-on-not-found"], {
    readFile: (p) => files[p],
    fetchImpl: async () => ({ ok: true, json: async () => ({ results: [{ extensions: [] }] }) }),
  });
  assert.equal(exitCode, 1);
});

test("run: check flags a publisher mismatch", async () => {
  const files = { "snap.json": JSON.stringify([{ publisher: "OldPublisher", name: "ext", version: "1.0.0" }]) };
  const { exitCode, output } = await run(["check", "snap.json"], {
    readFile: (p) => files[p],
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        results: [{ extensions: [{ publisher: { publisherName: "NewPublisher" }, versions: [{ version: "2.0.0" }] }] }],
      }),
    }),
  });
  assert.equal(exitCode, 0);
  assert.match(output, /Publisher on the listing differs/);
});

test("run: check reports a lookup failure per extension without crashing", async () => {
  const files = { "snap.json": JSON.stringify([{ publisher: "a", name: "b", version: "1.0.0" }]) };
  const { exitCode, output } = await run(["check", "snap.json"], {
    readFile: (p) => files[p],
    fetchImpl: async () => {
      throw new Error("network unreachable");
    },
  });
  assert.equal(exitCode, 0);
  assert.match(output, /Lookup failed/);
  assert.match(output, /network unreachable/);
});

test("run: check --json emits a parseable report", async () => {
  const files = { "snap.json": JSON.stringify([{ publisher: "a", name: "b", version: "1.0.0" }]) };
  const { output } = await run(["check", "snap.json", "--json"], {
    readFile: (p) => files[p],
    fetchImpl: async () => ({ ok: true, json: async () => ({ results: [{ extensions: [] }] }) }),
  });
  const parsed = JSON.parse(output);
  assert.equal(parsed[0].found, false);
});

test("run: check with a missing HTTP status surfaces as a lookup failure", async () => {
  const files = { "snap.json": JSON.stringify([{ publisher: "a", name: "b", version: "1.0.0" }]) };
  const { output } = await run(["check", "snap.json"], {
    readFile: (p) => files[p],
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  assert.match(output, /HTTP 503/);
});

// queryMarketplace itself, with an injected fetch.
test("queryMarketplace: parses a found extension", async () => {
  const result = await queryMarketplace("a.b", {
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ results: [{ extensions: [{ publisher: { publisherName: "a" }, versions: [{ version: "3.1.0" }] }] }] }),
    }),
  });
  assert.deepEqual(result, { found: true, latestVersion: "3.1.0", publisherName: "a" });
});

test("DEFAULT_EXTENSION_DIRS covers the major VS Code-compatible editors", () => {
  assert.ok(DEFAULT_EXTENSION_DIRS.some((d) => d.includes(".vscode")));
  assert.ok(DEFAULT_EXTENSION_DIRS.some((d) => d.includes(".cursor")));
  assert.ok(DEFAULT_EXTENSION_DIRS.some((d) => d.includes(".windsurf")));
});

// buildSnapshot itself, against a real temp directory -- no injection.
test("buildSnapshot: reads publisher/name/version and surface fields from real manifests", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vscode-extension-drift-check-"));
  try {
    await fs.mkdir(path.join(dir, "dbaeumer.vscode-eslint-2.4.4"));
    await fs.writeFile(
      path.join(dir, "dbaeumer.vscode-eslint-2.4.4", "package.json"),
      JSON.stringify({
        publisher: "dbaeumer",
        name: "vscode-eslint",
        version: "2.4.4",
        activationEvents: ["onStartupFinished"],
        main: "./client/out/extension",
      }),
    );
    // A directory with no package.json is skipped, not fatal.
    await fs.mkdir(path.join(dir, ".obsolete"));

    const snapshot = await buildSnapshot(dir);
    assert.equal(snapshot.length, 1);
    assert.equal(snapshot[0].publisher, "dbaeumer");
    assert.equal(snapshot[0].name, "vscode-eslint");
    assert.deepEqual(snapshot[0].activationEvents, ["onStartupFinished"]);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("buildSnapshot: a missing directory raises a clear error", async () => {
  await assert.rejects(() => buildSnapshot("/does/not/exist/at/all"), /cannot read/);
});
