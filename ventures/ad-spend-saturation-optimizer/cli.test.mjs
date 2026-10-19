import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { parseArgs, render } from "./cli.mjs";
import { sampleText, parseSpend, analyze, reportCsv } from "./calc.mjs";

const cli = new URL("./cli.mjs", import.meta.url).pathname;

test("parseArgs reads every option and rejects bad ones", () => {
  const o = parseArgs(["--margin", "45%", "--skip", "2025-11-24..2025-12-07", "--budget", "$12,000", "--csv", "f.csv"]);
  assert.equal(o.margin, 45);
  assert.equal(o.budget, 12000);
  assert.equal(o.skip, "2025-11-24..2025-12-07");
  assert.equal(o.file, "f.csv");
  assert.throws(() => parseArgs(["--margin", "0"]), /percent/);
  assert.throws(() => parseArgs(["--margin", "150"]), /percent/);
  assert.throws(() => parseArgs(["--budget", "-5"]), /above zero/);
  assert.throws(() => parseArgs(["--budget"]), /needs a value/);
  assert.throws(() => parseArgs(["--nope"]), /unknown option/);
  assert.throws(() => parseArgs(["a.csv", "b.csv"]), /one input file/);
  assert.throws(() => parseArgs(["--csv", "--json", "a.csv"]), /choose one/);
});

test("the table and the page's CSV come from the same analysis", () => {
  const text = sampleText();
  const res = analyze(parseSpend(text).rows, { margin: 0.6, skipWeeks: "" });
  assert.equal(render({ ...parseArgs([]), csv: true }, text).out, reportCsv(res));
  const { out, errors } = render(parseArgs([]), text);
  assert.deepEqual(errors, []);
  for (const c of res.channels) assert.ok(out.includes(c.name), c.name);
  assert.match(out, /Back-test, last \d+ weeks/);
  assert.match(out, /What-if totals/);
});

test("--budget prints the plan for that total, and says when it is out of range", () => {
  const text = sampleText();
  assert.match(render({ ...parseArgs([]), budget: 20000 }, text).out, /At \$(19|20),\d{3} a week the best split earns/);
  assert.match(render({ ...parseArgs([]), budget: 1e9 }, text).out, /outside what the per-channel limits allow/);
});

test("--json is valid and leaves out the bulky frontier and raw points", () => {
  const j = JSON.parse(render({ ...parseArgs([]), json: true }, sampleText()).out);
  assert.equal(j.channels.length, 4);
  assert.ok(j.summary.gain > 0);
  assert.equal(j.summary.frontier, undefined);
  assert.equal(j.channels[0].pts, undefined);
});

test("a bad skip range is reported and exits 1; an unreadable file exits 2", () => {
  const r = render({ ...parseArgs([]), skip: "not-a-date" }, sampleText());
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /skip range/);
  const bad = spawnSync("node", [cli, "/nonexistent.csv"], { encoding: "utf8" });
  assert.equal(bad.status, 2);
  assert.equal(spawnSync("node", [cli], { encoding: "utf8" }).status, 2);
});

test("running the file directly works with --example and with stdin", () => {
  const out = execFileSync("node", [cli, "--example"], { encoding: "utf8" });
  assert.match(out, /marginal ROAS/);
  const piped = execFileSync("node", [cli, "-"], { input: sampleText(), encoding: "utf8" });
  assert.equal(piped, out);
});

test("too little data is an error, not a crash", () => {
  const r = render(parseArgs([]), "date,channel,spend,revenue\n");
  assert.equal(r.out, "");
  assert.equal(r.errors.length, 1);
});
