import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, normalize } from "node:path";

// The image once copied only agent.mjs and imap.mjs, so the container died at start on the missing smtp.mjs.
// Walk the server's relative imports and require every file to be named in a COPY line.
const dir = import.meta.dirname;
const copied = new Set();
for (const line of readFileSync(join(dir, "Dockerfile"), "utf8").split("\n")) {
  const m = line.match(/^COPY\s+(.+?)\s+(\.\/\S*)\s*$/);
  if (!m) continue;
  const dest = m[2] === "./" ? "" : m[2].replace(/^\.\//, "");
  for (const f of m[1].split(/\s+/)) copied.add(normalize(join(dest, f.split("/").pop())));
}

function imports(rel, seen = new Set()) {
  if (seen.has(rel)) return seen;
  seen.add(rel);
  const src = readFileSync(join(dir, rel), "utf8");
  for (const m of src.matchAll(/from\s+"(\.[^"]+)"/g)) imports(normalize(join(dirname(rel), m[1])), seen);
  return seen;
}

test("the Dockerfile copies every module the self-host server imports", () => {
  const needed = [...imports("self-host/agent.mjs")];
  assert.ok(needed.length >= 8);
  const missing = needed.filter((f) => !copied.has(f));
  assert.deepEqual(missing, []);
});

test("render.yaml and fly.toml point at the Dockerfile and the data volume", () => {
  const r = readFileSync(join(dir, "render.yaml"), "utf8");
  assert.match(r, /dockerfilePath: ventures\/sales-agent\/Dockerfile/);
  assert.match(r, /key: ADMIN_TOKEN\s+generateValue: true/);
  assert.match(r, /mountPath: \/data/);
  for (const k of ["IMAP_HOST", "IMAP_USER", "IMAP_PASS"]) assert.match(r, new RegExp(`key: ${k}\\s+sync: false`));
  const f = readFileSync(join(dir, "fly.toml"), "utf8");
  assert.match(f, /DATA_DIR = "\/data"/);
  assert.match(f, /path = "\/healthz"/);
});
