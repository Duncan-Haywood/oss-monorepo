import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const run = (...a) => spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, ...a], { encoding: "utf8" });

test("an offer ahead of the alternative exits 0 and json parses", () => {
  const r = run("--acres", "160", "--rent", "900", "--json");
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).offerBeatsAlternative, true);
});

test("an offer behind the alternative exits 1", () => {
  const r = run("--acres", "160", "--rent", "100", "--escalator", "0", "--alt", "400");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /behind by/);
});

test("bad usage exits 2", () => {
  assert.equal(run().status, 2);
  assert.equal(run("--acres", "10", "--rent", "500", "--term", "0").status, 2);
  assert.equal(run("--bogus").status, 2);
});
