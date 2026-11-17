import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { run, parseArgs, HELP } from "./cli.mjs";

const data = (f) => fileURLToPath(new URL(`./data/${f}`, import.meta.url));
const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));

test("help cites the papers and carries the disclaimer", () => {
  const r = run(["--help"]);
  assert.equal(r.code, 0);
  for (const s of ["Gale, Lloyd S. Shapley (1962)", "doi:10.1145/362619.362631", "doi:10.2307/1913160", "No warranty", "Not legal or professional advice"]) assert.ok(HELP.includes(s), s);
});

test("text output: the matching, the listing and the compromises", () => {
  const r = run([data("residency-example.txt")]);
  assert.equal(r.code, 0);
  assert.match(r.out, /There are exactly 4 stable matchings/);
  assert.match(r.out, /Left without a place in every stable matching: Dara, Eli, Jun/);
  assert.match(r.out, /\n {2}egalitarian +total rank +46/);
  const c = run([data("cyclic-3x3.txt"), "--proposer", "b"]);
  assert.match(c.out, /^women proposing/);
  assert.match(c.out, /\n {2}x +C +choice 3\n/);
});

test("--check, --csv, --json and stdin", () => {
  const dir = mkdtempSync(join(tmpdir(), "sm-"));
  const f = join(dir, "mine.txt");
  writeFileSync(f, "x: A\ny: C\nz: B\n");
  const r = run([data("cyclic-3x3.txt"), "--check", f]);
  assert.match(r.out, /Your matching is not stable:/);
  assert.match(r.out, /blocking pair: /);
  const csv = run([data("cyclic-3x3.txt"), "--csv"]).out.split("\n");
  assert.equal(csv[0], "men,matching,matching rank,men-optimal,men-optimal rank,women-optimal,women-optimal rank,egalitarian,egalitarian rank,minimum-regret,minimum-regret rank");
  assert.equal(csv[1], "x,A,1,A,1,C,3,B,2,B,2");
  const j = JSON.parse(run([data("cyclic-3x3.txt"), "--json"]).out);
  assert.equal(j.stableMatchings.count, 3);
  const out = execFileSync(process.execPath, [CLI, "--no-enumerate"], { input: "[a]\nx: P\n[b]\nP: x\n" }).toString();
  assert.match(out, /This is the only stable matching/);
});

test("errors exit non-zero with a plain message", () => {
  assert.equal(run(["--nope"]).code, 2);
  assert.equal(run(["--proposer", "C"]).code, 2);
  assert.equal(run(["--limit", "0"]).code, 2);
  assert.equal(run([]).code, 2);
  const dir = mkdtempSync(join(tmpdir(), "sm-"));
  const f = join(dir, "bad.txt");
  writeFileSync(f, "[a]\nx: Q\n[b]\nP: x\n");
  const r = run([f]);
  assert.equal(r.code, 1);
  assert.match(r.out, /"Q", who is not in \[b\]/);
  assert.deepEqual(parseArgs(["x.txt", "--limit=5"]), { json: false, help: false, csv: false, file: "x.txt", proposer: "A", enumerate: true, limit: 5, check: null });
});
