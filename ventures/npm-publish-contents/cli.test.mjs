import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));
const run = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", cwd });

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "npc-"));
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), text);
  }
  return root;
}

test("reports a leaked .env behind a shadowed .gitignore and fails CI on high", () => {
  const root = fixture({
    "package.json": JSON.stringify({ name: "x", version: "1.0.0", main: "index.js" }),
    "index.js": "", ".env": "KEY=1", ".gitignore": ".env\n", ".npmignore": "test/\n", "test/a.test.js": "",
    "node_modules/dep/index.js": "",
  });
  const r = run([root, "--fail-on", "high"]);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /x@1\.0\.0: 3 of 6 files would be published/);
  assert.match(r.stdout, /\[high\] 1 file that looks secret would be published/);
  assert.match(r.stdout, /\.gitignore is not read: \.npmignore takes its place/);
  assert.match(r.stdout, /\+ \.env +no rule matches, so it ships/);
  const ok = run([root]);
  assert.equal(ok.status, 0);
});

test("--why explains one path and --json is parseable", () => {
  const root = fixture({ "package.json": JSON.stringify({ name: "y", version: "1.0.0", files: ["lib"] }), "lib/a.js": "", "src/a.ts": "" });
  const w = run([root, "--why", "src/a.ts"]);
  assert.equal(w.status, 0, w.stderr);
  assert.match(w.stdout, /src\/a\.ts: left out\n  folder src\/ is never entered: package\.json files: `\*`/);
  const j = JSON.parse(run([root, "--json"]).stdout);
  assert.deepEqual(j.files.sort(), ["lib/a.js", "package.json"]);
});

test("a folder without package.json is a usage error", () => {
  const root = fixture({ "a.js": "" });
  assert.equal(run([root]).status, 2);
});
