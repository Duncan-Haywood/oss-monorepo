import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sampleCsv } from "./calc.mjs";

const cli = new URL("./cli.mjs", import.meta.url).pathname;
const tmp = (name, text) => { const f = join(mkdtempSync(join(tmpdir(), "pss-")), name); writeFileSync(f, text); return f; };

test("cli prints the query, and lists flagged shapes", () => {
  assert.match(spawnSync("node", [cli, "--query"], { encoding: "utf8" }).stdout, /pg_stat_statements/);
  const r = spawnSync("node", [cli, tmp("s.csv", sampleCsv())], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /\[hot,cold\]/);
});

test("--fail-on exits 1 only when a named rule fires", () => {
  const f = tmp("s.csv", sampleCsv());
  assert.equal(spawnSync("node", [cli, f, "--fail-on", "temp"], { encoding: "utf8" }).status, 1);
  assert.equal(spawnSync("node", [cli, f, "--fail-on", "nonexistent"], { encoding: "utf8" }).status, 0);
});

test("cli exits 2 on a file without the needed columns", () => {
  assert.equal(spawnSync("node", [cli, tmp("b.csv", "a,b\n1,2")], { encoding: "utf8" }).status, 2);
});
