import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { EXAMPLE } from "./ballots.mjs";

const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));
const run = (args, input) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", input });

test("counts ballots from stdin and prints every round", () => {
  const r = run(["-"], EXAMPLE.ballots);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Instant runoff winner: Knoxville/);
  assert.match(r.stdout, /Round 1: Memphis 42, Nashville 26, Chattanooga 15, Knoxville 17/);
  assert.match(r.stdout, /Schulze ranking: Nashville > Chattanooga > Knoxville > Memphis/);
  assert.match(r.stdout, /Condorcet winner .*: Nashville/);
});

test("--seats runs a multi-seat STV count; --json and --csv give machine output", () => {
  const ballots = "4: Orange\n2: Pear > Orange\n8: Chocolate > Strawberry\n4: Chocolate > Bonbon\n1: Strawberry\n1: Bonbon";
  const r = run(["-", "--seats", "3"], ballots);
  assert.match(r.stdout, /STV, 3 seats, quota 6: elected Chocolate, Orange, Strawberry/);
  const j = JSON.parse(run(["-", "--seats", "3", "--json"], ballots).stdout);
  assert.deepEqual(j.stv.elected, ["Chocolate", "Orange", "Strawberry"]);
  assert.match(run(["-", "--csv"], ballots).stdout, /^Instant runoff round,/);
});

test("no ballots exits 1, no arguments exits 2", () => {
  assert.equal(run(["-"], "").status, 1);
  assert.equal(run([]).status, 2);
  const h = run(["--help"]);
  assert.equal(h.status, 0);
  assert.match(h.stdout, /10\.1007\/s00355-010-0475-4/);
});
