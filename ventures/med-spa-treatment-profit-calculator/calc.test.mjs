import { test } from "node:test";
import assert from "node:assert/strict";
import { analyse, parseTreatments, treatmentEconomics, money, pct } from "./calc.mjs";

const cfg = { providerRate: 60, roomRate: 30, turnoverMinutes: 0, feePct: 3, targetMargin: 50 };
const near = (a, b, eps = 0.011) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("parse accepts commas, tabs, dollar signs and a header row", () => {
  const p = parseTreatments("name,price,product,minutes,volume\nBotox 40u\t$600\t$280\t30\t20\nFacial, 150, 25, 60, 10");
  assert.equal(p.rows.length, 2);
  assert.deepEqual(p.rows[0], { name: "Botox 40u", price: 600, product: 280, minutes: 30, volume: 20 });
  assert.deepEqual(p.bad, []);
});

test("parse reports bad lines instead of dropping them", () => {
  const p = parseTreatments("Laser, abc, 10, 30, 5\nPeel, 100, 10, 0, 5\nOnly two, 5");
  assert.equal(p.rows.length, 0);
  assert.equal(p.bad.length, 3);
});

test("missing volume defaults to zero", () => {
  assert.equal(parseTreatments("Peel, 100, 10, 30").rows[0].volume, 0);
});

test("hand-checked: $600 neurotoxin visit, 30 minutes", () => {
  // fee 18, provider 30, room 15, product 280 -> contribution 600-18-325 = 257
  const e = treatmentEconomics({ name: "x", price: 600, product: 280, minutes: 30, volume: 20 }, cfg);
  near(e.fee, 18); near(e.provider, 30); near(e.room, 15);
  near(e.contribution, 257);
  near(e.margin, 257 / 600, 1e-9);
  near(e.perRoomHour, 514);
  near(e.monthlyContribution, 5140);
  // break-even price: direct 325 / 0.97
  near(e.breakEvenPrice, 335.05);
  // 50% target: 325 / (1 - .03 - .5) = 691.49
  near(e.targetPrice, 691.49);
});

test("turnover time is charged to the room but not to the provider", () => {
  const e = treatmentEconomics({ name: "x", price: 100, product: 0, minutes: 30, volume: 1 }, { ...cfg, turnoverMinutes: 30 });
  near(e.provider, 30); near(e.room, 30); assert.equal(e.roomMinutes, 60);
});

test("target price is null when fees plus target margin reach 100%", () => {
  const e = treatmentEconomics({ name: "x", price: 100, product: 1, minutes: 30, volume: 1 }, { ...cfg, feePct: 50, targetMargin: 50 });
  assert.equal(e.targetPrice, null);
});

test("analyse ranks by contribution per room hour", () => {
  const a = analyse({ ...cfg, treatmentText: "Botox, 600, 280, 30, 20\nFacial, 150, 25, 60, 10" });
  assert.equal(a.result.ranked[0].name, "Botox");
  near(a.result.revenue, 12000 + 1500);
  const facial = a.result.rows[1];
  // fee 4.5, provider 60, room 30, product 25 -> 30.5
  near(facial.contribution, 30.5);
  assert.ok(a.findings.some((f) => /Facial is below/.test(f.title)));
});

test("a treatment that loses money is flagged high with its break-even price", () => {
  const a = analyse({ ...cfg, treatmentText: "Laser, 100, 90, 60, 4" });
  const f = a.findings.find((x) => /loses money/.test(x.title));
  assert.equal(f.severity, "high");
  assert.match(f.detail, /Break-even price is \$/);
});

test("capacity and fixed-cost findings", () => {
  const a = analyse({ ...cfg, roomHoursAvailable: 5, monthlyFixed: 20000, treatmentText: "Botox, 600, 280, 30, 20" });
  near(a.result.roomHours, 10);
  near(a.result.utilisation, 2, 1e-9);
  assert.ok(a.findings.some((f) => /exceeds room capacity/.test(f.title)));
  assert.ok(a.findings.some((f) => /does not cover fixed costs/.test(f.title)));
  near(a.result.profit, 5140 - 20000);
  // break-even: contribution/room hour is 514; 20000/514 hours
  near(a.result.breakEvenRoomHours, 20000 / 514, 1e-6);
});

test("empty input asks for a treatment and returns no result", () => {
  const a = analyse({ ...cfg, treatmentText: "  " });
  assert.equal(a.result, null);
  assert.equal(a.findings[0].severity, "high");
});

test("money and pct format", () => {
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(pct(0.4281), "42.8%");
  assert.equal(pct(null), "n/a");
});
