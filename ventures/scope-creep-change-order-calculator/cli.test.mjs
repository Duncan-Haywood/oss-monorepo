import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const run = (args, input) => spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, ...args], { input, encoding: "utf8" });

test("prints a change order from stdin", () => {
  const r = run(["--price", "6000", "--hours", "60", "--client", "Acme"], "SSO | 6\nDark mode | 4\n");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Change order total: \$1000\.00/);
});

test("gate exits 1 when creep is over the cap", () => {
  const r = run(["--price", "6000", "--hours", "60", "--max-creep-pct", "10"], "SSO | 12\n");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /FAIL/);
});

test("bad input exits 2", () => {
  assert.equal(run(["--price", "6000"], "SSO | 6\n").status, 2);
  assert.equal(run(["--price", "6000", "--hours", "60"], "garbage\n").status, 2);
});
