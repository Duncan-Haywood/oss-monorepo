import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, readInput, model, sampleInput, encodeShare, decodeShare, toCsv, SHARE_KEYS } from "./calc.mjs";

const base = () => readInput(sampleInput()).v;

test("the worked example nets gross less fees, meals, staging and auction cost", () => {
  const m = model(base());
  assert.equal(m.gross, 94600);
  assert.equal(m.fees, 2088);
  assert.equal(m.catering, 17000);
  assert.equal(m.fixed, 19400);
  assert.equal(m.cost, 40988);
  assert.equal(m.net, 53612);
  assert.equal(m.costPerDollar, 0.43);
  assert.equal(m.netPerGuest, 268.06);
});

test("each extra paying guest adds ticket plus giving after fees, less the meal", () => {
  const m = model(base());
  assert.equal(m.slope, 176.9);
  const more = model({ ...base(), guests: 181 });
  assert.equal(Math.round((more.net - m.net) * 100) / 100, 176.9);
});

test("guests needed for the goal reach it and one fewer does not", () => {
  const m = model(base());
  assert.equal(m.goalGuests, 217);
  assert.ok(model({ ...base(), guests: 217 }).net >= 60000);
  assert.ok(model({ ...base(), guests: 216 }).net < 60000);
});

test("ticket price for the goal reaches it at the expected headcount", () => {
  const m = model(base());
  assert.equal(m.goalTicket, 187);
  assert.ok(model({ ...base(), ticket: 187 }).net >= 60000);
  assert.ok(model({ ...base(), ticket: 186 }).net < 60000);
});

test("break-even guests is the smallest headcount with net at or above zero", () => {
  const v = { ...base(), sponsors: 0, auctionGross: 0, auctionCost: 0, raffle: 0 };
  const m = model(v);
  assert.ok(m.breakEvenGuests > 0);
  assert.ok(model({ ...v, guests: m.breakEvenGuests }).net >= 0);
  assert.ok(model({ ...v, guests: m.breakEvenGuests - 1 }).net < 0);
});

test("a ticket that does not cover the meal has no break-even and says so", () => {
  const r = plan({ ...sampleInput(), ticket: "40", fmv: "20", givePerGuest: "0", cateringPerHead: "90" });
  assert.equal(r.model.breakEvenGuests, null);
  assert.equal(r.model.goalGuests, null);
  assert.ok(r.advice.some((a) => /does not exist/.test(a)));
  assert.ok(r.advice.some((a) => /Another guest does not help/.test(a)));
});

test("a goal already met is reported as cleared", () => {
  const r = plan({ ...sampleInput(), goal: "40000" });
  assert.ok(r.advice.some((a) => /clear the \$40,000 goal by \$13,612/.test(a)));
});

test("attendance and ticket tables move net in the expected direction", () => {
  const r = plan(sampleInput());
  assert.ok(r.attendance[0].net < r.attendance[2].net && r.attendance[2].net < r.attendance[3].net);
  assert.equal(r.attendance[2].net, r.model.net);
  assert.ok(r.tickets[0].net < r.tickets[4].net);
});

test("cost per dollar above fifty cents is flagged", () => {
  const r = plan({ ...sampleInput(), sponsors: "0", auctionGross: "0", raffle: "0" });
  assert.ok(r.model.costPerDollar > 0.5);
  assert.ok(r.advice.some((a) => /above \$0\.50/.test(a)));
});

test("bad input is explained, not computed", () => {
  assert.match(plan({ ...sampleInput(), guests: "12.5" }).error, /whole number/);
  assert.match(plan({ ...sampleInput(), guests: "0", comps: "0" }).error, /at least one/);
  assert.match(plan({ ...sampleInput(), ticket: "-5" }).error, /ticket/);
  assert.match(plan({ ...sampleInput(), feePct: "40" }).error, /fees/);
  assert.match(plan({ ...sampleInput(), fmv: "500" }).error, /cannot exceed/);
});

test("share links carry only known keys and round-trip", () => {
  assert.deepEqual(decodeShare("#" + encodeShare(sampleInput())), sampleInput());
  assert.deepEqual(decodeShare("#evil=1&guests=90"), { guests: "90" });
  assert.equal(SHARE_KEYS.length, Object.keys(sampleInput()).length);
});

test("CSV has a row per attendance case", () => {
  const r = plan(sampleInput());
  assert.equal(toCsv(r).split("\n").length, r.attendance.length + 1);
});
