import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { findClientMaps } from "./check-no-client-maps.mjs";

const script = fileURLToPath(new URL("./check-no-client-maps.mjs", import.meta.url));
const run = (dir) => spawnSync(process.execPath, [script, dir], { encoding: "utf8" });

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), "client-maps-"));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  return dir;
}

test("a clean client build passes", () => {
  const dir = fixture({
    "index.html": "<!doctype html>",
    "assets/index-abc.js": "console.log(1);\n",
  });
  assert.deepEqual(findClientMaps(dir), []);
  assert.equal(run(dir).status, 0);
});

test("a .map file in any subdirectory fails", () => {
  const dir = fixture({
    "assets/index-abc.js": "x\n//# sourceMappingURL=index-abc.js.map",
    "assets/index-abc.js.map": "{}",
  });
  assert.deepEqual(findClientMaps(dir), ["assets/index-abc.js.map"]);
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /served publicly/);
});

test("an inline data: map fails too", () => {
  const dir = fixture({
    "assets/a.js": "x\n//# sourceMappingURL=data:application/json;base64,e30=",
  });
  assert.deepEqual(findClientMaps(dir), ["assets/a.js (inline map)"]);
});

test("a missing directory exits 2", () => {
  assert.equal(run(join(tmpdir(), "does-not-exist-client-maps")).status, 2);
});
