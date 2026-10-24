import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { run } from "./cli.mjs";
import { sampleFile, sampleBrokenFile, validate } from "./calc.mjs";

async function setup() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ofxcli-"));
  await fs.writeFile(path.join(dir, "good.ofx"), sampleFile());
  await fs.mkdir(path.join(dir, "sub"));
  await fs.writeFile(path.join(dir, "sub", "bad.QFX"), sampleBrokenFile());
  await fs.writeFile(path.join(dir, "notes.txt"), "ignore me");
  return dir;
}
const cap = () => { const o = []; const e = []; return { o, e, io: { out: (s) => o.push(s), err: (s) => e.push(s) } }; };

test("check walks a folder, skips other extensions, exits 1 on errors", async () => {
  const dir = await setup();
  const c = cap();
  const code = await run(["check", dir, "--json"], c.io);
  const res = JSON.parse(c.o.join(""));
  assert.equal(code, 1);
  assert.deepEqual(res.map((r) => path.basename(r.file)), ["good.ofx", "bad.QFX"]);
  assert.equal(res[0].summary.errors, 0);
  assert.ok(res[1].summary.errors > 0);
});

test("check on a clean file exits 0", async () => {
  const dir = await setup();
  const c = cap();
  assert.equal(await run(["check", path.join(dir, "good.ofx")], c.io), 0);
});

test("fix writes a .fixed copy, leaves the original, and the copy has fewer errors", async () => {
  const dir = await setup();
  const src = path.join(dir, "sub", "bad.QFX");
  const before = await fs.readFile(src, "utf8");
  const c = cap();
  await run(["fix", src, "--diff"], c.io);
  assert.equal(await fs.readFile(src, "utf8"), before);
  const fixed = await fs.readFile(path.join(dir, "sub", "bad.fixed.QFX"), "utf8");
  assert.ok(validate(fixed).summary.errors < validate(before).summary.errors);
  assert.match(c.o.join(""), /wrote /);
});

test("fix refuses to overwrite the input and rejects --out with several files", async () => {
  const dir = await setup();
  const src = path.join(dir, "sub", "bad.QFX");
  assert.equal(await run(["fix", src, "--out", src], cap().io), 2);
  assert.equal(await run(["fix", dir, "--out", path.join(dir, "x.ofx")], cap().io), 2);
});

test("usage errors exit 2 and a missing path is reported", async () => {
  assert.equal(await run([], cap().io), 2);
  assert.equal(await run(["check", "/nonexistent-ofx-path"], cap().io), 2);
  assert.equal(await run(["check", "--bogus", "x"], cap().io), 2);
});
