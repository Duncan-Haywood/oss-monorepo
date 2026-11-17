import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { run } from "./cli.mjs";
import { EXAMPLE } from "./cvss.mjs";

const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));

test("scores one vector", () => {
  const r = run([EXAMPLE.vector]);
  assert.equal(r.code, 0);
  assert.match(r.out, /base 9\.8 Critical/);
  assert.match(r.out, /AV  Attack Vector: Network/);
});

test("diff and json", () => {
  const r = run([EXAMPLE.vector, "--diff", EXAMPLE.compare]);
  assert.match(r.out, /B 7\.5 High/);
  assert.match(r.out, /AC  Low -> High/);
  const j = JSON.parse(run([EXAMPLE.vector, "--diff", EXAMPLE.compare, "--json"]).out);
  assert.equal(j.baseDelta, -2.3);
});

test("audit from stdin, strict exit code", () => {
  const r = run(["--audit", "-", "--strict"], { stdin: () => EXAMPLE.text });
  assert.equal(r.code, 1);
  assert.match(r.out, /5 CVSS v3 vectors \(text\); 5 with a stated score\. ok 2, mismatch 2, explained 1, invalid 0\./);
  assert.equal(run(["--audit", "-"], { stdin: () => EXAMPLE.text }).code, 0);
  assert.equal(run(["--audit", "-", "--strict"], { stdin: () => "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H 9.8" }).code, 0);
});

test("bad input exits 2 from the real process", () => {
  const p = spawnSync(process.execPath, [CLI, "CVSS:3.1/AV:N"], { encoding: "utf8" });
  assert.equal(p.status, 2);
  assert.match(p.stderr, /Missing base metrics/);
  const ok = spawnSync(process.execPath, [CLI, EXAMPLE.vector], { encoding: "utf8" });
  assert.equal(ok.status, 0);
  assert.equal(spawnSync(process.execPath, [CLI], { encoding: "utf8" }).status, 2);
});
