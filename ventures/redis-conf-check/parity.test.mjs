import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compare } from "./parity/compare.mjs";
import { makeCase, fingerprint } from "./parity/gen.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const rec = JSON.parse(readFileSync(path.join(here, "parity/redis-7.0.json"), "utf8"));

test("the engine agrees with the recorded redis-server 7.0.15 run, case by case", () => {
  const res = compare(rec);
  assert.equal(res.cases, 800);
  assert.ok(res.values > 40000, `values ${res.values}`);
  assert.ok(res.probes > 450, `probes ${res.probes}`);
  assert.deepEqual(res.diffs.slice(0, 5), []);
});

test("the recording is of the generator as it stands", () => {
  for (const c of rec.cases) assert.equal(c.fp, fingerprint(makeCase(c.seed)), `seed ${c.seed}`);
});

test("the run exercised the outcomes it claims to", () => {
  const c = rec.cases;
  assert.ok(c.some((x) => x.started) && c.some((x) => x.fatal) && c.some((x) => x.exit));
  for (const side of ["remote", "local"]) for (const o of ["ok", "noauth", "refused"]) assert.ok(c.some((x) => x[side]?.ping === o), `${side} ${o}`);
  assert.ok(c.some((x) => x.remote?.ping === "denied"), "protected mode");
  assert.ok(c.some((x) => x.socket), "a unix socket probe");
  assert.ok(c.some((x) => x.remote?.configSetDir === "ok") && c.some((x) => x.remote?.moduleLoad === "ok"), "open dangerous paths");
  assert.ok(!c.some((x) => [x.remote, x.local, x.socket].some((p) => p && Object.values(p).some((v) => String(v).startsWith("other")))), "a probe failed for an unexpected reason");
  assert.match(rec.server, /^Redis server v=7\.0\.15/);
});
