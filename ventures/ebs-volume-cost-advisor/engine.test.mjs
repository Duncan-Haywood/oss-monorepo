import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseVolumes, analyze, summarize, volumeCost, gp2Baseline, sizeGp3, DEFAULTS, DEFAULT_PRICES } from "./engine.mjs";

const text = readFileSync(new URL("./fixtures/volumes.csv", import.meta.url), "utf8");
const by = (r) => Object.fromEntries(r.volumes.map((v) => [v.name, v]));

test("parser maps header columns, defaults state, skips bad rows", () => {
  const p = parseVolumes("# c\nstate,volume,type,size_gb,peak_iops\navailable,vol-1,gp2,100,0\nin-use,vol-2,gp9,100,0\nin-use,vol-3,gp3,0,0\n");
  assert.equal(p.rows.length, 1);
  assert.deepEqual([p.rows[0].name, p.rows[0].state, p.rows[0].type], ["vol-1", "available", "gp2"]);
  assert.equal(p.skipped, 2);
});

test("prices are exact products of the price table", () => {
  assert.ok(Math.abs(volumeCost("gp2", 500, 0, 0) - 50) < 1e-9);
  assert.ok(Math.abs(volumeCost("gp3", 200, 6000, 250) - (16 + 15 + 5)) < 1e-9);
  assert.ok(Math.abs(volumeCost("io1", 1000, 20000, 0) - (125 + 1300)) < 1e-9);
  assert.equal(gp2Baseline(10), 100);
  assert.equal(gp2Baseline(10000), 16000);
});

test("gp3 sizing never goes below the free baseline and respects the throughput-per-IOPS ratio", () => {
  const g = sizeGp3({ sizeGb: 500, peakIops: 10, peakMibps: 10 }, DEFAULTS, DEFAULT_PRICES);
  assert.deepEqual([g.iops, g.mibps], [3000, 125]);
  const t = sizeGp3({ sizeGb: 500, peakIops: 100, peakMibps: 400 }, DEFAULTS, DEFAULT_PRICES);
  assert.ok(t.iops >= t.mibps * 4);
  assert.equal(sizeGp3({ sizeGb: 500, peakIops: 20000, peakMibps: 10 }, DEFAULTS, DEFAULT_PRICES), null);
});

test("gp2 -> gp3 saves 20% on a small steady volume; io1 -> gp3 saves most; over-provisioned gp3 is trimmed", () => {
  const v = by(analyze(parseVolumes(text)));
  assert.equal(v["vol-0a1"].recommended, "gp3");
  assert.ok(Math.abs(v["vol-0a1"].saving - 10) < 1e-9);
  assert.equal(v["vol-0a3"].recommended, "gp3");
  assert.ok(v["vol-0a3"].saving > 1000);
  assert.equal(v["vol-0a5"].recommended, "gp3");
  assert.ok(Math.abs(v["vol-0a5"].saving - 20) < 1e-9);
  assert.match(v["vol-0a5"].command, /--iops 3000 --throughput 125/);
});

test("st1 stays when it covers the peak; unattached volume is flagged for deletion", () => {
  const r = analyze(parseVolumes(text));
  assert.equal(by(r)["vol-0a4"].recommended, "st1");
  assert.equal(by(r)["vol-0a6"].recommended, "delete");
  assert.ok(r.findings.some((f) => f.rule === "unattached-volume" && f.row === "vol-0a6"));
});

test("a big gp2 above baseline is an error (cannot burst); a small one is a warning", () => {
  const r = analyze(parseVolumes(text));
  assert.equal(r.findings.find((f) => f.rule === "gp2-burst-dependent" && f.row === "vol-0a2").severity, "error");
  const small = analyze(parseVolumes("v,gp2,100,,,2000,10"));
  assert.equal(small.findings.find((f) => f.rule === "gp2-burst-dependent").severity, "warn");
});

test("HDD above its IOPS limit is an error and moves to gp3", () => {
  const r = analyze(parseVolumes("v,st1,2000,,,900,100"));
  assert.ok(r.findings.some((f) => f.rule === "peak-exceeds-type-limit" && f.severity === "error"));
  assert.equal(by(r).v.recommended, "gp3");
});

test("a clean fleet reports volumes-fine; totals add up; empty input is none", () => {
  const ok = analyze(parseVolumes("v,gp3,100,3000,125,500,20"));
  assert.ok(ok.findings.some((f) => f.rule === "volumes-fine"));
  const r = analyze(parseVolumes(text));
  assert.ok(Math.abs(r.totals.current - r.totals.best - r.totals.saving) < 1e-6);
  assert.equal(summarize(analyze(parseVolumes("nothing"))).status, "none");
});
