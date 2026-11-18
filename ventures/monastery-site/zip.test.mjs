import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { zip, unzip, crc32 } from "./zip.mjs";

test("crc32 matches the published check value", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("an archive round-trips text and binary entries", () => {
  const bin = new Uint8Array([0, 255, 1, 254, 137, 80, 78, 71]);
  const out = unzip(zip([["index.html", "<p>Pax ✝</p>"], ["images/hero.png", bin]]));
  assert.equal(new TextDecoder().decode(out.get("index.html")), "<p>Pax ✝</p>");
  assert.deepEqual([...out.get("images/hero.png")], [...bin]);
});

test("the same entries and date give the same bytes", () => {
  const a = zip([["a.txt", "x"]]), b = zip([["a.txt", "x"]]);
  assert.deepEqual([...a], [...b]);
});

test("unsafe paths are refused", () => {
  assert.throws(() => zip([["../evil", "x"]]), /Unsafe/);
  assert.throws(() => zip([["/etc/x", "x"]]), /Unsafe/);
});

test("the system unzip reads the archive, when it is installed", (t) => {
  try { execFileSync("unzip", ["-v"], { stdio: "ignore" }); } catch { t.skip("unzip not installed"); return; }
  const dir = mkdtempSync(path.join(tmpdir(), "zip-"));
  try {
    writeFileSync(path.join(dir, "s.zip"), zip([["site/index.html", "hello"], ["site/images/a.bin", new Uint8Array([1, 2, 3])]]));
    execFileSync("unzip", ["-q", "s.zip"], { cwd: dir });
    assert.equal(readFileSync(path.join(dir, "site/index.html"), "utf8"), "hello");
    assert.deepEqual([...readFileSync(path.join(dir, "site/images/a.bin"))], [1, 2, 3]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
