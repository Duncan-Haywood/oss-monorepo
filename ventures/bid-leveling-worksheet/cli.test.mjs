import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sampleCsv } from "./calc.mjs";

const cli = new URL("./cli.mjs", import.meta.url).pathname;
const withFile = (t) => { const d = mkdtempSync(join(tmpdir(), "bids-")); const f = join(d, "b.csv"); writeFileSync(f, t); return f; };

test("exits 1 when the low base bid changes after leveling", () => {
  const r = spawnSync("node", [cli, withFile(sampleCsv())], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /1\. Apex Mechanical/);
});

test("exits 0 when the low bid stays low", () => {
  const r = spawnSync("node", [cli, withFile("item,estimate,A,B\nBASE,,100,120\nx,5,incl,incl")], { encoding: "utf8" });
  assert.equal(r.status, 0);
});

test("--json parses; usage and bad input exit 2", () => {
  assert.ok(JSON.parse(spawnSync("node", [cli, withFile(sampleCsv()), "--json"], { encoding: "utf8" }).stdout).ranked.length === 3);
  assert.equal(spawnSync("node", [cli], { encoding: "utf8" }).status, 2);
  assert.equal(spawnSync("node", [cli, withFile("a,b")], { encoding: "utf8" }).status, 2);
});
