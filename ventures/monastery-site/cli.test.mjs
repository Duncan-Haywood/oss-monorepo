import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unzip } from "./zip.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, "build.mjs");

test("--check prints the checklist and exits 0 when nothing is high", () => {
  const out = execFileSync(process.execPath, [cli, path.join(here, "examples/abbey.json"), "--check"], { encoding: "utf8" });
  assert.match(out, /Launch checklist/);
});

test("a high finding exits 1, so the checklist can gate a deploy", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ms-"));
  try {
    writeFileSync(path.join(dir, "c.json"), JSON.stringify({ community: { name: "X" } }));
    const r = spawnSync(process.execPath, [cli, path.join(dir, "c.json"), "--json"], { encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.ok(JSON.parse(r.stdout).some((f) => f.level === "high"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("--out writes the site and --zip writes the same pages as one archive", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ms-"));
  try {
    execFileSync(process.execPath, [cli, path.join(here, "examples/sisters.json"), "--out", path.join(dir, "site"), "--zip", path.join(dir, "site.zip")]);
    const files = readdirSync(path.join(dir, "site")).sort();
    assert.ok(files.includes("vocations.html") && files.includes("sitemap.xml"));
    const z = unzip(new Uint8Array(readFileSync(path.join(dir, "site.zip"))));
    assert.deepEqual([...z.keys()].sort(), files);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
