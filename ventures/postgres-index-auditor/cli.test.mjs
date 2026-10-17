import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sampleCsv } from "./calc.mjs";

const cli = new URL("./cli.mjs", import.meta.url).pathname;

test("cli prints the query, and exits 1 with statements when indexes are flagged", () => {
  assert.match(spawnSync("node", [cli, "--query"], { encoding: "utf8" }).stdout, /pg_stat_user_indexes/);
  const f = join(mkdtempSync(join(tmpdir(), "pia-")), "i.csv");
  writeFileSync(f, sampleCsv());
  const r = spawnSync("node", [cli, f], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /DROP INDEX CONCURRENTLY/);
});

test("cli exits 2 on a file without the needed columns", () => {
  const f = join(mkdtempSync(join(tmpdir(), "pia-")), "bad.csv");
  writeFileSync(f, "a,b\n1,2");
  assert.equal(spawnSync("node", [cli, f], { encoding: "utf8" }).status, 2);
});
