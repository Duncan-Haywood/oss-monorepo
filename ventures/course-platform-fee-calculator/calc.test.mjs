import { test } from "node:test";
import assert from "node:assert/strict";
import { compareCoursePlatforms, crossoverSales, PRESETS, DEFAULT_PROCESSOR } from "./calc.mjs";

const pct = { name: "Pct", monthlyFee: 0, txPercent: 10, txFlat: 0, processorOnTop: false };
const flat = { name: "Flat", monthlyFee: 100, txPercent: 0, txFlat: 0, processorOnTop: false };

test("net is gross minus refunds minus per-sale fees minus the monthly fee", () => {
  const r = compareCoursePlatforms({ price: 100, salesPerMonth: 10, refundRatePercent: 10, platforms: [pct, flat] });
  const p = r.rows.find((x) => x.name === "Pct");
  // 1000 gross, 100 refunded, 100 fee => 800
  assert.equal(p.gross, 1000);
  assert.equal(p.net, 800);
  const f = r.rows.find((x) => x.name === "Flat");
  assert.equal(f.net, 800); // 1000 - 100 refunded - 100 plan
});

test("processor fee is added only where the platform fee excludes it", () => {
  const on = { ...flat, name: "On", monthlyFee: 0, processorOnTop: true };
  const r = compareCoursePlatforms({ price: 100, salesPerMonth: 1, platforms: [on, pct] });
  const row = r.rows.find((x) => x.name === "On");
  assert.ok(Math.abs(row.fees - (100 * 0.029 + 0.3)) < 1e-9);
});

test("crossover is where the flat plan starts to beat the percentage", () => {
  const n = crossoverSales(pct, flat, { price: 100 });
  assert.equal(n, 10); // 100 / (10 - 0)
  assert.equal(crossoverSales(pct, { ...pct, name: "Same" }, { price: 100 }), null);
  assert.equal(crossoverSales({ ...flat, monthlyFee: 0 }, { ...flat, monthlyFee: 50 }, { price: 100 }), null);
});

test("ranking flips across the volume ladder", () => {
  const r = compareCoursePlatforms({ price: 100, salesPerMonth: 5, platforms: [pct, flat] });
  assert.equal(r.best.name, "Pct");
  assert.equal(r.ladder.find((l) => l.sales === 5).winner, "Pct");
  assert.equal(r.ladder.find((l) => l.sales === 100).winner, "Flat");
  assert.match(r.findings.map((f) => f.title).join("|"), /flips near 10/);
});

test("validation errors come back as { error }, not exceptions", () => {
  assert.match(compareCoursePlatforms({ price: "", salesPerMonth: 1, platforms: [pct, flat] }).error, /Price/);
  assert.match(compareCoursePlatforms({ price: 0, salesPerMonth: 1, platforms: [pct, flat] }).error, /greater than zero/);
  assert.match(compareCoursePlatforms({ price: 10, salesPerMonth: 1, platforms: [pct] }).error, /at least two/);
  assert.match(compareCoursePlatforms({ price: 10, salesPerMonth: 1, refundRatePercent: 120, platforms: [pct, flat] }).error, /Refund/);
  assert.match(compareCoursePlatforms({ price: 10, salesPerMonth: 1, platforms: [pct, { ...flat, txPercent: -1 }] }).error, /at least 0/);
});

test("zero sales leaves a monthly fee as a pure loss and no divide-by-zero", () => {
  const r = compareCoursePlatforms({ price: 50, salesPerMonth: 0, platforms: [pct, flat] });
  assert.equal(r.rows.find((x) => x.name === "Flat").net, -100);
  assert.equal(r.rows[0].costPercentOfGross, null);
});

test("every preset is complete and the processor default is sane", () => {
  assert.ok(PRESETS.length >= 6);
  for (const p of PRESETS) {
    assert.ok(p.id && p.name && Number.isFinite(p.monthlyFee) && Number.isFinite(p.txPercent) && Number.isFinite(p.txFlat), p.id);
  }
  assert.equal(DEFAULT_PROCESSOR.percent, 2.9);
  const r = compareCoursePlatforms({ price: 197, salesPerMonth: 20, platforms: PRESETS });
  assert.equal(r.rows.length, PRESETS.length);
  assert.ok(r.rows[0].net >= r.rows[r.rows.length - 1].net);
});

test("extra creator-platform presets stay out of the first-load table but compare cleanly", () => {
  const extra = PRESETS.filter((p) => p.listed === false);
  assert.ok(extra.length >= 6);
  assert.ok(PRESETS.filter((p) => p.listed !== false).length >= 6, "the original course platforms still load by default");
  for (const id of ["lemon-squeezy", "paddle", "payhip-free", "kofi-free", "buymeacoffee", "patreon-standard", "stan-store"]) {
    assert.ok(PRESETS.some((p) => p.id === id), id);
  }
  // A $20 sale on a 5% + $0.50 merchant of record nets $18.50 before refunds.
  const ls = PRESETS.find((p) => p.id === "lemon-squeezy");
  const r = compareCoursePlatforms({ price: 20, salesPerMonth: 1, refundRatePercent: 0, platforms: [ls, pct] });
  assert.ok(Math.abs(r.rows.find((x) => x.name === "Lemon Squeezy").net - 18.5) < 1e-9);
  // A flat plan overtakes a percentage cut at some volume.
  const kofi = PRESETS.find((p) => p.id === "kofi-free"), gold = PRESETS.find((p) => p.id === "kofi-gold");
  assert.ok(crossoverSales(kofi, gold, { price: 25 }) > 0);
});
