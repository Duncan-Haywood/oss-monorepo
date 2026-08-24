import test from "node:test";
import assert from "node:assert/strict";

function plan(price, percent, weeklyBookings, bookingRate) {
  const deposit = price * percent / 100;
  return { deposit, balance: price - deposit, annual: deposit * weeklyBookings * bookingRate / 100 * 52 };
}

test("deposit and balance preserve the service total", () => {
  const result = plan(150, 25, 12, 93);
  assert.equal(result.deposit, 37.5);
  assert.equal(result.balance, 112.5);
});

test("annual secured cash applies the assumed booking rate", () => {
  assert.equal(plan(150, 25, 12, 93).annual, 21762);
});

test("a zero deposit does not change the service balance", () => {
  assert.deepEqual(plan(80, 0, 10, 100), { deposit: 0, balance: 80, annual: 0 });
});

test("non-finite form numbers are rejected before formatting", () => {
  assert.equal(Number.isFinite(Number("")), true);
  assert.equal(Number.isFinite(Number("not-a-number")), false);
});
