import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { parseArgs, run, render, resolveContainerArg } from "./cli.mjs";
import { sampleCargo, parseCargo, SYSTEMS } from "./calc.mjs";

const cli = new URL("./cli.mjs", import.meta.url).pathname;

test("the built-in sample keeps every line (a comma in a name used to drop the pallet line)", () => {
  const r = parseCargo(sampleCargo());
  assert.equal(r.lines.length, 5);
  assert.deepEqual(r.warnings, []);
});

test("parseArgs reads flags and rejects bad ones", () => {
  const o = parseArgs(["--container", "20ft", "--compare", "--restarts", "5", "--csv", "f.csv"]);
  assert.deepEqual([o.container, o.compare, o.restarts, o.csv, o.file], ["20ft", true, 5, true, "f.csv"]);
  assert.throws(() => parseArgs(["--bogus"]), /unknown option/);
  assert.throws(() => parseArgs(["--restarts", "0"]), /at least 1/);
  assert.throws(() => parseArgs(["--csv", "--json"]), /choose one/);
  assert.throws(() => parseArgs(["--container"]), /needs/);
});

test("container argument: preset, custom in cm/kg, custom in inches/pounds, and nonsense", () => {
  assert.equal(resolveContainerArg("20FT", SYSTEMS.metric).container.id, "20ft");
  const c = resolveContainerArg("589x235x239@28200", SYSTEMS.metric).container;
  assert.deepEqual([c.l, c.w, c.h, c.payload], [5890, 2350, 2390, 28200]);
  const i = resolveContainerArg("100x50x50@1000", SYSTEMS.imperial).container;
  assert.deepEqual([i.l, i.w, i.h], [2540, 1270, 1270]);
  assert.ok(Math.abs(i.payload - 453.59237) < 1e-6);
  assert.match(resolveContainerArg("huge", SYSTEMS.metric).error, /LxWxH@payload/);
});

test("run: a small load that fits one 20 ft container, with the counts adding up", () => {
  const res = run("Box,50,40,40,10,100,upright\nCrate,100,80,60,50,10,upright", { container: "20ft" });
  assert.equal(res.plan.containersNeeded, 1);
  assert.equal(res.plan.packedUnits, 110);
  assert.deepEqual(res.notices, []);
  assert.match(render(res), /Containers needed\s+1/);
});

test("run: units that cannot fit are named, not dropped silently", () => {
  const res = run("Beam,900,20,20,10,2,fixed\nBox,50,40,40,10,5,upright", { container: "truck26" });
  assert.ok(res.notices.some((n) => /Beam: 2 units cannot go in this container/.test(n)));
  assert.equal(res.plan.packedUnits, 5);
});

test("run: bad input comes back as an error, not a throw", () => {
  assert.match(run("nothing useful").error, /cargo line/i);
  assert.match(run("Box,50,40,40,10,5", { container: "x" }).error, /--container/);
});

test("--compare adds the other sizes", () => {
  const res = run("Box,50,40,40,10,200,upright", { container: "40ft", compare: true, restarts: 4 });
  assert.ok(res.comparison.options.length >= 10);
  assert.match(render(res), /Other sizes, same cargo/);
});

test("command line: example text, csv, json, html, errors", () => {
  const text = spawnSync(process.execPath, [cli, "--example", "--restarts", "4"], { encoding: "utf8" });
  assert.equal(text.status, 0);
  assert.match(text.stdout, /Containers needed/);
  assert.match(text.stdout, /Euro pallet \(floor only\)/);
  const csv = spawnSync(process.execPath, [cli, "--example", "--csv", "--restarts", "4"], { encoding: "utf8" });
  assert.match(csv.stdout, /^container,step,line,/);
  const json = JSON.parse(spawnSync(process.execPath, [cli, "--example", "--json", "--restarts", "4"], { encoding: "utf8" }).stdout);
  assert.equal(json.packedUnits, json.totalUnits);
  assert.equal(json.lines.length, 5);
  const html = spawnSync(process.execPath, [cli, "--example", "--html", "--restarts", "4"], { encoding: "utf8" });
  assert.match(html.stdout, /^<!doctype html>/);
  assert.match(html.stdout, /No warranty/);
  const bad = spawnSync(process.execPath, [cli, "--container", "x", "--example"], { encoding: "utf8" });
  assert.equal(bad.status, 2);
  const stdin = spawnSync(process.execPath, [cli, "-"], { input: "Box,50,40,40,10,20,upright\n", encoding: "utf8" });
  assert.equal(stdin.status, 0);
  assert.match(stdin.stdout, /Units packed\s+20 of 20/);
});
