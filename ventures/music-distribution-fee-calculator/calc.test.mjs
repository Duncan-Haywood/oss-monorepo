import { test } from "node:test";
import assert from "node:assert/strict";
import { compareDistributors, crossoverRoyalties, PRESETS } from "./calc.mjs";

const share = { name: "Share", planFee: 0, releaseFee: 0, commissionPercent: 20 };
const flat = { name: "Flat", planFee: 25, releaseFee: 0, commissionPercent: 0 };

test("net is royalties minus plan fee, release fees and the royalty cut", () => {
  const r = compareDistributors({ streamsPerMonth: 10000, payoutPerStream: 0.004, releasesPerYear: 2, distributors: [share, { ...flat, releaseFee: 5 }] });
  // 10000 * 0.004 * 12 = 480
  assert.equal(r.royalties, 480);
  assert.equal(r.rows.find((x) => x.name === "Share").net, 384); // 480 - 96
  assert.equal(r.rows.find((x) => x.name === "Flat").net, 445);  // 480 - 25 - 10
});

test("crossover is the royalty level where the flat plan starts to win", () => {
  assert.equal(crossoverRoyalties(share, flat, { releases: 1 }), 125); // 25 / 0.20
  assert.equal(crossoverRoyalties(share, { ...share, name: "Same" }, { releases: 1 }), null);
  assert.equal(crossoverRoyalties({ ...flat, planFee: 0 }, { ...flat, planFee: 25 }, { releases: 1 }), null);
});

test("ranking flips across the stream ladder", () => {
  const r = compareDistributors({ streamsPerMonth: 1000, payoutPerStream: 0.004, releasesPerYear: 1, distributors: [share, flat] });
  assert.equal(r.best.name, "Share");
  assert.equal(r.ladder.find((l) => l.streams === 100000).winner, "Flat");
  const flip = r.findings.find((f) => /flips near/.test(f.title));
  assert.ok(flip);
  assert.match(flip.title, /2,604/); // 125 / (0.004*12)
});

test("a flat fee above total royalties is flagged", () => {
  const r = compareDistributors({ streamsPerMonth: 100, payoutPerStream: 0.004, releasesPerYear: 1, distributors: [share, flat] });
  assert.ok(r.findings.some((f) => /exceed your whole royalty/.test(f.title)));
});

test("validation errors come back as { error }", () => {
  assert.match(compareDistributors({ streamsPerMonth: "", releasesPerYear: 1, distributors: [share, flat] }).error, /Streams/);
  assert.match(compareDistributors({ streamsPerMonth: 10, releasesPerYear: 1, distributors: [share] }).error, /at least two/);
  assert.match(compareDistributors({ streamsPerMonth: 10, releasesPerYear: 1, payoutPerStream: 0, distributors: [share, flat] }).error, /greater than zero/);
  assert.match(compareDistributors({ streamsPerMonth: 10, releasesPerYear: 1, distributors: [share, { ...flat, commissionPercent: 120 }] }).error, /at most 100/);
});

test("zero streams makes the plan fee a pure loss, with no divide-by-zero", () => {
  const r = compareDistributors({ streamsPerMonth: 0, releasesPerYear: 1, distributors: [share, flat] });
  assert.equal(r.rows.find((x) => x.name === "Flat").net, -25);
  assert.equal(r.rows[0].costPercentOfRoyalties, null);
});

test("every preset is complete and runs through the comparison", () => {
  assert.ok(PRESETS.length >= 5);
  for (const p of PRESETS) assert.ok(p.id && p.name && Number.isFinite(p.planFee) && Number.isFinite(p.releaseFee) && Number.isFinite(p.commissionPercent), p.id);
  const r = compareDistributors({ streamsPerMonth: 20000, releasesPerYear: 4, distributors: PRESETS });
  assert.equal(r.rows.length, PRESETS.length);
  assert.ok(r.rows[0].net >= r.rows[r.rows.length - 1].net);
});
