import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compare } from "./parity/compare.mjs";
import { parseCase, matchCase } from "./parity/gen.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const rec = JSON.parse(readFileSync(path.join(here, "parity/pg-16.json"), "utf8"));

test("the engine agrees with the recorded PostgreSQL 16 run, row by row and connection by connection", () => {
  const { rows, conns, diffs } = compare(rec);
  assert.ok(rows > 2000, `rows ${rows}`);
  assert.ok(conns >= 5000, `connections ${conns}`);
  assert.deepEqual(diffs.slice(0, 5), []);
});

test("the recording is of the generator as it stands", () => {
  for (const c of rec.parse.slice(0, 50)) assert.deepEqual(parseCase(c.seed), c.files, `parse seed ${c.seed}`);
  for (const c of rec.match.slice(0, 50)) assert.deepEqual(matchCase(c.seed), c.files, `match seed ${c.seed}`);
});

test("the run exercised the outcomes it claims to", () => {
  const all = rec.match.flatMap((c) => c.results);
  for (const o of ["auth", "reject", "none"]) assert.ok(all.some((r) => r.outcome === o), o);
  assert.ok(!all.some((r) => r.outcome === "other"), "a connection failed for a reason other than pg_hba.conf");
  assert.ok(rec.parse.flatMap((c) => c.rows).some((r) => r.error == null), "some rows parse");
  assert.ok(rec.parse.flatMap((c) => c.rows).some((r) => r.error != null), "some rows fail");
});
