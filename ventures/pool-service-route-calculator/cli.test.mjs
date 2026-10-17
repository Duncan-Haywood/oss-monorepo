import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run } from "./cli.mjs";

const accounts = readFileSync(new URL("./fixtures/accounts.csv", import.meta.url), "utf8");
const io = { readFile: async () => accounts };

test("audit ranks accounts, prints the route line and the density table", async () => {
  const r = await run(["audit", "accounts.csv"], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /^5 of 10 accounts earn under \$40\.00 an hour/);
  assert.match(r.output, /Foster \(Far Rd\) +\$125\.00 +4\.5 +\$51\.39 +\$11\.53 +\$251\.81 +drop +\$33\.78/);
  assert.match(r.output, /Route: \$1,390\.00 a month for 29\.9 hours = \$30\.46\/h/);
  assert.match(r.output, /15 +\$31\.44 +\$165\.25 +\$30\.55/);
  assert.match(r.output, /not market rates/);
});

test("--csv prints only the CSV audit; --json is parseable and honours flags", async () => {
  const c = await run(["audit", "accounts.csv", "--csv"], io);
  assert.equal(c.output.split("\n").length, 11);
  assert.match(c.output.split("\n")[0], /^account,price/);
  const a = JSON.parse((await run(["audit", "accounts.csv", "--json"], io)).output);
  const b = JSON.parse((await run(["audit", "accounts.csv", "--json", "--target", "60", "--truck", "30"], io)).output);
  assert.equal(b.options.targetHourly, 60);
  assert.ok(b.route.below >= a.route.below);
  assert.ok(b.route.blended < a.route.blended);
});

test("stop shows only the new-stop table and honours --leg", async () => {
  const r = await run(["stop", "accounts.csv", "--leg", "8"], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /8 min drive earns \$40\.83\/h/);
  assert.doesNotMatch(r.output, /Account +Price/);
});

test("bad input exits 2 with usage", async () => {
  for (const argv of [[], ["nope"], ["audit"], ["audit", "a.csv", "--bogus"], ["audit", "a.csv", "--target"], ["audit", "a.csv", "--truck", "x"], ["stop", "a.csv", "--leg", "-4"]]) {
    const r = await run(argv, io);
    assert.equal(r.exitCode, 2, argv.join(" "));
    assert.match(r.output, /Usage:/);
  }
  const bad = await run(["audit", "a.csv"], { readFile: async () => "A,flat,20,5,1,0" });
  assert.match(bad.output, /Line 1: price/);
  const none = await run(["audit", "a.csv"], { readFile: async () => "# nothing\n" });
  assert.match(none.output, /No account rows/);
  const missing = await run(["audit", "a.csv"], { readFile: async () => { throw new Error("nope"); } });
  assert.match(missing.output, /Cannot read a\.csv/);
  assert.equal((await run(["--help"])).exitCode, 0);
});
