import { test } from "node:test";
import assert from "node:assert/strict";
import { toDay, fromDay, addMonths, checkRules, earliestEligible, fiveTwentyFour, netValue, spendStatus, spendFeasible, buildPlan, toIcs, orderWishlist } from "./plan.mjs";

const c = (issuer, openedOn, extra = {}) => ({ id: issuer + openedOn, name: issuer, issuer, openedOn, ...extra });

test("date helpers round-trip and reject impossible dates", () => {
  assert.equal(fromDay(toDay("2026-03-31")), "2026-03-31");
  assert.throws(() => toDay("2026-02-30"));
  assert.throws(() => toDay("nope"));
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-10-09", -24), "2024-10-09");
});

test("5/24 counts personal cards in 24 months and says when you drop under", () => {
  const cards = [c("amex", "2024-11-01"), c("citi", "2025-01-15"), c("chase", "2025-06-01"), c("capital one", "2025-09-01"), c("citi", "2026-02-01")];
  const r = fiveTwentyFour(cards, "2026-10-09");
  assert.equal(r.count, 5);
  assert.equal(r.status, "over");
  assert.equal(r.dropsOn, "2026-11-01"); // a card is no longer counted once it is 24 months old
  assert.equal(fiveTwentyFour(cards.slice(1), "2026-10-09").status, "under");
});

test("business cards do not count toward 5/24", () => {
  const cards = [c("amex", "2025-01-01", { personal: false }), c("citi", "2025-02-01")];
  assert.equal(fiveTwentyFour(cards, "2026-01-01").count, 1);
});

test("a card exactly 24 months old no longer counts", () => {
  assert.equal(fiveTwentyFour([c("citi", "2024-10-09")], "2026-10-09").count, 0);
  assert.equal(fiveTwentyFour([c("citi", "2024-10-10")], "2026-10-09").count, 1);
});

test("issuer velocity rules and earliestEligible", () => {
  const cards = [c("amex", "2026-10-01")];
  const r = checkRules(cards, "amex", "2026-10-03");
  assert.equal(r.ok, false);
  assert.equal(r.results.find((x) => x.rule.id === "amex-1-5").ok, false);
  assert.equal(earliestEligible(cards, "amex", "2026-10-03"), "2026-10-06");
  assert.equal(checkRules(cards, "unknown bank", "2026-10-03").ok, true);
});

test("net value uses cpp, cash, and the first-year fee unless waived", () => {
  assert.equal(netValue({ bonusPoints: 80000, cpp: 1.5, annualFee: 95 }), 1105);
  assert.equal(netValue({ bonusCash: 200, annualFee: 95, firstYearFeeWaived: true }), 200);
});

test("spendStatus gives deadline, remaining, daily and monthly pace", () => {
  const s = spendStatus({ openedOn: "2026-10-01", windowDays: 90, minSpend: 4000 }, 1000, "2026-10-31");
  assert.equal(s.deadline, "2026-12-30");
  assert.equal(s.remaining, 3000);
  assert.equal(s.daysLeft, 60);
  assert.equal(s.perDay, 50);
  assert.equal(s.done, false);
  assert.equal(spendStatus({ openedOn: "2026-01-01", windowDays: 30, minSpend: 500 }, 0, "2026-06-01").missed, true);
});

test("demand-bound check: overlapping minimums share one monthly budget", () => {
  const perDay = 1000 / 30;
  assert.equal(spendFeasible([{ release: 0, due: 90, work: 3000 }], perDay), true);
  assert.equal(spendFeasible([{ release: 0, due: 90, work: 3000 }, { release: 0, due: 90, work: 1000 }], perDay), false);
  // A tight early deadline fails even though the long window has room.
  assert.equal(spendFeasible([{ release: 0, due: 10, work: 2000 }, { release: 0, due: 90, work: 100 }], perDay), false);
});

test("buildPlan staggers cards so spend and issuer rules both hold", () => {
  const wishlist = [
    { name: "A", issuer: "chase", bonusPoints: 60000, cpp: 1.5, annualFee: 95, minSpend: 4000, windowDays: 90 },
    { name: "B", issuer: "amex", bonusPoints: 80000, cpp: 1.2, annualFee: 0, minSpend: 6000, windowDays: 180 },
  ];
  const p = buildPlan({ wishlist, monthlySpend: 2000, todayIso: "2026-10-09" });
  assert.equal(p.placed.length, 2);
  assert.equal(p.placed[0].applyOn, "2026-10-09");
  // 4000 over 90 days uses 4000 of the first 90 days' 5917 capacity, so B's 6000 in 180 days
  // cannot start until the combined demand fits.
  assert.ok(p.placed[1].applyOn >= "2026-10-09");
  const tasks = p.placed.map((x) => ({ release: toDay(x.applyOn), due: toDay(x.spendBy), work: x.card.minSpend }));
  assert.equal(spendFeasible(tasks, (2000 * 12) / 365), true);
  assert.equal(p.totalNet, 60000 * 0.015 - 95 + 80000 * 0.012);
});

test("buildPlan defers a card whose issuer rule blocks it and counts planned cards", () => {
  const wishlist = [
    { name: "A", issuer: "citi", bonusCash: 200, minSpend: 500, windowDays: 90 },
    { name: "B", issuer: "citi", bonusCash: 200, minSpend: 500, windowDays: 90 },
  ];
  const p = buildPlan({ wishlist, monthlySpend: 5000, todayIso: "2026-10-09" });
  assert.equal(p.placed[0].applyOn, "2026-10-09");
  assert.equal(p.placed[1].applyOn, "2026-10-17"); // citi 1 per 8 days
});

test("buildPlan accounts for a bonus already in progress and skips the impossible", () => {
  const owned = [{ id: "x", issuer: "chase", openedOn: "2026-10-01", windowDays: 90, minSpend: 6000 }];
  const wishlist = [{ name: "Big", issuer: "capital one", bonusCash: 900, minSpend: 20000, windowDays: 90 }];
  const p = buildPlan({ owned, wishlist, monthlySpend: 1000, todayIso: "2026-10-09", horizonDays: 200 });
  assert.equal(p.placed.length, 0);
  assert.equal(p.skipped.length, 1);
});

test("ordering by efficiency puts the cheap-to-earn bonus first", () => {
  const a = { name: "hard", bonusCash: 1000, minSpend: 10000 };
  const b = { name: "easy", bonusCash: 200, minSpend: 500 };
  assert.deepEqual(orderWishlist([a, b], "efficiency").map((x) => x.name), ["easy", "hard"]);
  assert.deepEqual(orderWishlist([b, a], "net").map((x) => x.name), ["hard", "easy"]);
});

test("ICS export has an apply and a deadline event per card", () => {
  const p = buildPlan({ wishlist: [{ name: "A", issuer: "citi", bonusCash: 1, minSpend: 100, windowDays: 90 }], monthlySpend: 1000, todayIso: "2026-10-09" });
  const ics = toIcs(p);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.match(ics, /DTSTART;VALUE=DATE:20261009/);
  assert.match(ics, /DTSTART;VALUE=DATE:20270107/);
});
