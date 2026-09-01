import test from "node:test";
import assert from "node:assert/strict";

import { loadQuote, calculate, overrunScenarios, targetRateLadder, targetHoursBudget, directCostSpikeScenarios, directCostSpikeSummary, discountAskScenarios, discountAskSummary, compareBillingModels, billingModelSummary, billingModelNote, loadKillFeeProgress, compareKillFee, killFeeSummary, targetPriceBreakdown, encodeQuote, decodeQuote, decodePanels, QUOTE_PRESETS } from "./calc.mjs";

test("calculates hidden time and target price", () => {
  const quote = loadQuote({
    price: 2400,
    delivery_hours: 24,
    admin_hours: 5,
    revision_hours: 6,
    overhead: 180,
    subcontractor_cost: 300,
    target_hourly_rate: 75,
    time_buffer_percent: 20,
  });
  const result = calculate(quote);
  assert.equal(result.total_hours, 35);
  assert.ok(Math.abs(result.effective_hourly_rate - 54.8571428) < 1e-6);
  assert.equal(result.target_price, 3105);
  assert.equal(result.break_even_price, 480);
  assert.equal(result.gap_to_target, -705);
  assert.equal(result.minimum_price_adjustment, 705);
  assert.equal(result.buffered_hours, 42);
  assert.equal(result.buffered_target_price, 3630);
  assert.equal(result.hidden_hours, 11);
  assert.equal(result.hidden_time_percent, (11 / 35) * 100);
  assert.equal(result.target_rate_hours, 25.6);
  assert.ok(Math.abs(result.hours_cushion + 9.4) < 1e-9);
});

test("defaults the time buffer to zero", () => {
  const quote = loadQuote({ price: 1000, delivery_hours: 10, target_hourly_rate: 100 });
  const result = calculate(quote);
  assert.equal(result.buffered_hours, 10);
  assert.equal(result.buffered_target_price, 1000);
});

test("defaults optional costs and time to zero", () => {
  const quote = loadQuote({ price: 1000, delivery_hours: 10, target_hourly_rate: 100 });
  assert.equal(calculate(quote).effective_hourly_rate, 100);
});

test("rejects invalid required values", () => {
  const invalid = [
    { price: 0, delivery_hours: 1, target_hourly_rate: 1 },
    { price: 1, delivery_hours: -1, target_hourly_rate: 1 },
    { price: 1, delivery_hours: 1, target_hourly_rate: 0 },
  ];
  for (const data of invalid) {
    assert.throws(() => loadQuote(data));
  }
});

test("rejects booleans as numbers", () => {
  assert.throws(() => loadQuote({ price: true, delivery_hours: 1, target_hourly_rate: 1 }));
});

test("rejects non-finite numbers", () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.throws(() => loadQuote({ price: value, delivery_hours: 1, target_hourly_rate: 1 }));
  }
});

test("reports price left after direct costs", () => {
  const quote = loadQuote({ price: 1000, delivery_hours: 10, overhead: 125, subcontractor_cost: 75, target_hourly_rate: 80 });
  assert.equal(calculate(quote).cost_coverage, 800);
  assert.equal(calculate(quote).discount_room, 0);
  assert.equal(calculate(quote).minimum_price_adjustment, 0);
});

test("reports discount room above target without recommending a price", () => {
  const quote = loadQuote({ price: 4000, delivery_hours: 10, target_hourly_rate: 100 });
  assert.equal(calculate(quote).discount_room, 3000);
  assert.equal(calculate(quote).minimum_price_adjustment, 0);
});

test("reports target-rate capacity from the quoted price", () => {
  const quote = loadQuote({ price: 1500, delivery_hours: 10, admin_hours: 2, revision_hours: 1, overhead: 100, target_hourly_rate: 100 });
  const result = calculate(quote);
  assert.equal(result.target_rate_hours, 14);
  assert.equal(result.hours_cushion, 1);
});

test("currency defaults and is trimmed", () => {
  const quote = loadQuote({ currency: " USD ", price: 1000, delivery_hours: 10, target_hourly_rate: 100 });
  assert.equal(quote.currency, "USD");
});

test("rejects an empty or over-long currency label", () => {
  assert.throws(() => loadQuote({ currency: "   ", price: 1000, delivery_hours: 10, target_hourly_rate: 100 }));
  assert.throws(() =>
    loadQuote({ currency: "WAY TOO LONG A LABEL", price: 1000, delivery_hours: 10, target_hourly_rate: 100 }),
  );
});

test("calculates transparent overrun sensitivity without changing the quote", () => {
  const quote = loadQuote({ price: 2400, delivery_hours: 24, admin_hours: 5, revision_hours: 6, overhead: 180, subcontractor_cost: 300, target_hourly_rate: 75 });
  const report = calculate(quote);
  assert.deepEqual(overrunScenarios(quote, report).map((scenario) => scenario.total_hours), [38.5, 43.75, 52.5]);
  assert.equal(overrunScenarios(quote, report)[0].effective_hourly_rate, 49.87012987012987);
  assert.equal(report.total_hours, 35);
});

test("builds a target-rate ladder from the same hours and direct costs", () => {
  const quote = loadQuote({ price: 2400, delivery_hours: 24, admin_hours: 5, revision_hours: 6, overhead: 180, subcontractor_cost: 300, target_hourly_rate: 75 });
  const report = calculate(quote);
  assert.deepEqual(targetRateLadder(quote, report, [50, 75, 100]), [
    { hourly_rate: 50, target_price: 2230, difference_from_quote: -170 },
    { hourly_rate: 75, target_price: 3105, difference_from_quote: 705 },
    { hourly_rate: 100, target_price: 3980, difference_from_quote: 1580 },
  ]);
});

test("compares a cost rise without changing hours or the quoted price", () => {
  const quote = loadQuote({
    price: 2400,
    delivery_hours: 24,
    admin_hours: 5,
    revision_hours: 6,
    overhead: 180,
    subcontractor_cost: 300,
    target_hourly_rate: 75,
  });
  const report = calculate(quote);
  const rows = directCostSpikeScenarios(quote, report);
  assert.deepEqual(rows.map((row) => row.percent), [0, 10, 25, 50]);
  assert.equal(rows[0].direct_costs, 480);
  assert.equal(rows[0].effective_hourly_rate, report.effective_hourly_rate);
  assert.equal(rows[0].target_price, 3105);
  assert.equal(rows[0].gap_to_target, -705);
  assert.equal(rows[0].extra_gap, 0);

  assert.equal(rows[1].direct_costs, 528);
  assert.ok(Math.abs(rows[1].effective_hourly_rate - 53.48571428571428) < 1e-9);
  assert.equal(rows[1].target_price, 3153);
  assert.equal(rows[1].gap_to_target, -753);
  assert.equal(rows[1].extra_gap, -48);

  assert.equal(rows[2].direct_costs, 600);
  assert.ok(Math.abs(rows[2].effective_hourly_rate - 51.42857142857143) < 1e-9);
  assert.equal(rows[2].target_price, 3225);
  assert.equal(rows[2].gap_to_target, -825);
  assert.equal(rows[2].extra_gap, -120);

  assert.equal(rows[3].direct_costs, 720);
  assert.equal(rows[3].effective_hourly_rate, 48);
  assert.equal(rows[3].target_price, 3345);
  assert.equal(rows[3].gap_to_target, -945);
  assert.equal(rows[3].extra_gap, -240);

  assert.equal(report.total_hours, 35);
  assert.equal(report.direct_costs, 480);
});

test("cost-rise summary names the price that would hold the target rate", () => {
  const quote = loadQuote({
    price: 2400,
    delivery_hours: 24,
    admin_hours: 5,
    revision_hours: 6,
    overhead: 180,
    subcontractor_cost: 300,
    target_hourly_rate: 75,
  });
  const report = calculate(quote);
  assert.match(
    directCostSpikeSummary(quote, report),
    /rise 25%.*54\.86.*51\.43.*3225\.00 instead of units 2400\.00/,
  );
});

test("a quote with no direct costs is unchanged by a cost rise", () => {
  const quote = loadQuote({ price: 1000, delivery_hours: 10, target_hourly_rate: 100 });
  const report = calculate(quote);
  const rows = directCostSpikeScenarios(quote, report);
  for (const row of rows) {
    assert.equal(row.direct_costs, 0);
    assert.equal(row.effective_hourly_rate, 100);
    assert.equal(row.target_price, 1000);
    assert.equal(row.extra_gap, 0);
  }
  assert.match(directCostSpikeSummary(quote, report), /does not change/);
});

test("compares a client discount ask without changing hours or direct costs", () => {
  const quote = loadQuote({
    price: 2400,
    delivery_hours: 24,
    admin_hours: 5,
    revision_hours: 6,
    overhead: 180,
    subcontractor_cost: 300,
    target_hourly_rate: 75,
  });
  const report = calculate(quote);
  const rows = discountAskScenarios(quote, report);
  assert.deepEqual(rows.map((row) => row.percent), [0, 5, 10, 15, 20]);
  assert.equal(rows[0].discounted_price, 2400);
  assert.equal(rows[0].effective_hourly_rate, report.effective_hourly_rate);
  assert.equal(rows[0].gap_to_target, -705);
  assert.equal(rows[0].extra_gap, 0);
  assert.ok(Math.abs(rows[0].hours_at_target - 25.6) < 1e-9);
  assert.ok(Math.abs(rows[0].hours_to_cut - 9.4) < 1e-9);

  assert.equal(rows[2].discounted_price, 2160);
  assert.equal(rows[2].cost_coverage, 1680);
  assert.equal(rows[2].effective_hourly_rate, 48);
  assert.equal(rows[2].gap_to_target, -945);
  assert.equal(rows[2].extra_gap, -240);
  assert.ok(Math.abs(rows[2].hours_at_target - 22.4) < 1e-9);
  assert.ok(Math.abs(rows[2].hours_to_cut - 12.6) < 1e-9);

  assert.equal(report.total_hours, 35);
  assert.equal(report.direct_costs, 480);
});

test("discount-ask summary names the hours that would have to leave", () => {
  const quote = loadQuote({
    price: 2400,
    delivery_hours: 24,
    admin_hours: 5,
    revision_hours: 6,
    overhead: 180,
    subcontractor_cost: 300,
    target_hourly_rate: 75,
  });
  const report = calculate(quote);
  assert.match(
    discountAskSummary(quote, report),
    /10% off.*2160\.00.*54\.86.*48\.00.*cutting 12\.60 hours/,
  );
});

test("a discount that still clears the target needs no scope cut", () => {
  const quote = loadQuote({ price: 2000, delivery_hours: 10, target_hourly_rate: 100 });
  const report = calculate(quote);
  const ten = discountAskScenarios(quote, report).find((row) => row.percent === 10);
  assert.equal(ten.discounted_price, 1800);
  assert.equal(ten.effective_hourly_rate, 180);
  assert.equal(ten.hours_to_cut, 0);
  assert.match(discountAskSummary(quote, report), /no scope cut is required/);
});

test("a discount that no longer covers direct costs cannot be fixed by cutting hours", () => {
  const quote = loadQuote({ price: 1000, delivery_hours: 10, overhead: 800, target_hourly_rate: 80 });
  const report = calculate(quote);
  const fifty = discountAskScenarios(quote, report, [50]).find((row) => row.percent === 50);
  assert.equal(fifty.discounted_price, 500);
  assert.equal(fifty.cost_coverage, -300);
  assert.equal(fifty.effective_hourly_rate, -30);
  assert.equal(fifty.hours_at_target, null);
  assert.equal(fifty.hours_to_cut, null);
  assert.match(discountAskSummary(quote, report, discountAskScenarios(quote, report, [50])), /no longer covers/);
});

function exampleQuote() {
  return loadQuote({
    price: 2400,
    delivery_hours: 24,
    admin_hours: 5,
    revision_hours: 6,
    overhead: 180,
    subcontractor_cost: 300,
    target_hourly_rate: 75,
  });
}

test("compares finishing with a kill fee and walking with only the deposit", () => {
  const quote = exampleQuote();
  const report = calculate(quote);
  const progress = loadKillFeeProgress(
    { hours_done: 14, already_paid: 1200, kill_fee: 360, sunk_costs: 180 },
    quote,
    report,
  );
  const compared = compareKillFee(quote, report, progress);
  assert.equal(compared.remaining_hours, 21);
  assert.equal(compared.remaining_invoice, 1200);
  assert.equal(compared.remaining_costs, 300);

  assert.equal(compared.finish.cash_kept, 1920);
  assert.equal(compared.finish.net_from_here, 900);
  assert.ok(Math.abs(compared.finish.rate_from_here - 900 / 21) < 1e-9);
  assert.equal(compared.finish.hours_still_worked, 21);
  assert.equal(compared.finish.vs_finish, 0);

  assert.equal(compared.kill.cash_kept, 1380);
  assert.equal(compared.kill.vs_finish, -540);
  assert.equal(compared.kill.hours_freed, 21);
  assert.equal(compared.kill.refill_value, 1575);
  assert.equal(compared.kill.refill_adjusted, 2955);
  assert.equal(compared.kill.refill_vs_finish, 1035);

  assert.equal(compared.walk.cash_kept, 1020);
  assert.equal(compared.walk.vs_finish, -900);
  assert.equal(compared.walk.refill_adjusted, 2595);
  assert.equal(compared.walk.refill_vs_finish, 675);

  assert.equal(compared.cash_winner, "finish");
  assert.equal(compared.refill_winner, "kill");
});

test("kill-fee summary names the cash gap and the refill flip", () => {
  const quote = exampleQuote();
  const report = calculate(quote);
  const progress = loadKillFeeProgress(
    { hours_done: 14, already_paid: 1200, kill_fee: 360, sunk_costs: 180 },
    quote,
    report,
  );
  assert.match(
    killFeeSummary(quote, report, progress),
    /Finishing keeps units 1920\.00 — units 540\.00 more cash than the kill fee \(units 1380\.00\).*900\.00 from here \(units 42\.86\/hour\).*21\.00 freed hours.*1035\.00 ahead/,
  );
});

test("a kill fee can already keep more cash than finishing", () => {
  const quote = exampleQuote();
  const report = calculate(quote);
  const progress = loadKillFeeProgress(
    { hours_done: 8, already_paid: 2160, kill_fee: 80, sunk_costs: 180 },
    quote,
    report,
  );
  const compared = compareKillFee(quote, report, progress);
  assert.equal(compared.remaining_hours, 27);
  assert.equal(compared.remaining_invoice, 240);
  assert.equal(compared.remaining_costs, 300);
  assert.equal(compared.finish.net_from_here, -60);
  assert.equal(compared.kill.cash_kept, 2060);
  assert.equal(compared.kill.vs_finish, 140);
  assert.equal(compared.cash_winner, "kill");
  assert.equal(compared.refill_winner, "kill");
  assert.match(killFeeSummary(quote, report, progress), /kill fee keeps units 2060\.00 — units 140\.00 more cash than finishing/);
});

test("walking with only the deposit is the kill-fee path at zero", () => {
  const quote = exampleQuote();
  const report = calculate(quote);
  const progress = loadKillFeeProgress(
    { hours_done: 14, already_paid: 1200, kill_fee: 0, sunk_costs: 180 },
    quote,
    report,
  );
  const compared = compareKillFee(quote, report, progress);
  assert.equal(compared.kill.cash_kept, compared.walk.cash_kept);
  assert.equal(compared.walk.cash_kept, 1020);
});

test("no remaining hours compares leftover invoices only", () => {
  const quote = exampleQuote();
  const report = calculate(quote);
  const progress = loadKillFeeProgress(
    { hours_done: 35, already_paid: 1200, kill_fee: 360, sunk_costs: 480 },
    quote,
    report,
  );
  const compared = compareKillFee(quote, report, progress);
  assert.equal(compared.remaining_hours, 0);
  assert.equal(compared.finish.rate_from_here, null);
  assert.equal(compared.kill.refill_value, 0);
  assert.equal(compared.finish.cash_kept, 1920);
  assert.equal(compared.kill.cash_kept, 1080);
  assert.match(killFeeSummary(quote, report, progress), /No hours remain/);
});

test("rejects kill-fee inputs that exceed the quote", () => {
  const quote = exampleQuote();
  const report = calculate(quote);
  assert.throws(
    () => loadKillFeeProgress({ hours_done: 36, already_paid: 0, kill_fee: 0, sunk_costs: 0 }, quote, report),
    /hours_done/,
  );
  assert.throws(
    () => loadKillFeeProgress({ hours_done: 0, already_paid: 2401, kill_fee: 0, sunk_costs: 0 }, quote, report),
    /already_paid/,
  );
  assert.throws(
    () => loadKillFeeProgress({ hours_done: 0, already_paid: 0, kill_fee: 0, sunk_costs: 481 }, quote, report),
    /sunk_costs/,
  );
  assert.throws(() => loadKillFeeProgress({ hours_done: true }, quote, report));
  assert.throws(() => loadKillFeeProgress({ hours_done: NaN }, quote, report));
});

test("a steep cost rise can leave nothing after direct costs", () => {
  const quote = loadQuote({ price: 1000, delivery_hours: 10, overhead: 800, target_hourly_rate: 80 });
  const report = calculate(quote);
  const spike50 = directCostSpikeScenarios(quote, report).find((row) => row.percent === 50);
  assert.equal(spike50.direct_costs, 1200);
  assert.equal(spike50.cost_coverage, -200);
  assert.equal(spike50.effective_hourly_rate, -20);
});

test("compares a fixed quote to hourly at the same hours and costs", () => {
  const quote = loadQuote({
    price: 2400,
    delivery_hours: 24,
    admin_hours: 5,
    revision_hours: 6,
    overhead: 180,
    subcontractor_cost: 300,
    target_hourly_rate: 75,
  });
  const report = calculate(quote);
  const rows = compareBillingModels(quote, report);
  assert.deepEqual(rows.map((row) => row.percent), [0, 10, 25, 50]);
  assert.equal(rows[0].total_hours, 35);
  assert.equal(rows[0].hourly_total, 3105);
  assert.equal(rows[0].hourly_minus_fixed, 705);
  assert.ok(Math.abs(rows[0].fixed_effective_rate - 54.8571428) < 1e-6);
  assert.equal(rows[3].total_hours, 52.5);
  assert.equal(rows[3].hourly_total, 4417.5);
  assert.equal(rows[3].hourly_minus_fixed, 2017.5);
  assert.equal(rows[3].fixed_effective_rate, (2400 - 480) / 52.5);
  const summary = billingModelSummary(quote, report);
  assert.equal(summary.fixed_is_below_hourly, true);
  assert.equal(summary.hourly_minus_fixed, 705);
  assert.match(billingModelNote(quote, report), /3105\.00/);
  assert.match(billingModelNote(quote, report), /705\.00 more than/);
  assert.match(billingModelNote(quote, report), /not a recommendation/);
});

test("a fixed quote above hourly at the target is not a discount", () => {
  const quote = loadQuote({ price: 2000, delivery_hours: 10, target_hourly_rate: 100 });
  const report = calculate(quote);
  const planned = compareBillingModels(quote, report, [0])[0];
  assert.equal(planned.hourly_total, 1000);
  assert.equal(planned.hourly_minus_fixed, -1000);
  assert.equal(billingModelSummary(quote, report).fixed_is_below_hourly, false);
  assert.match(billingModelNote(quote, report), /1000\.00 less than/);
});

test("a fixed quote that already matches hourly says so", () => {
  const quote = loadQuote({ price: 3105, delivery_hours: 24, admin_hours: 5, revision_hours: 6, overhead: 180, subcontractor_cost: 300, target_hourly_rate: 75 });
  const report = calculate(quote);
  assert.equal(billingModelSummary(quote, report).hourly_minus_fixed, 0);
  assert.match(billingModelNote(quote, report), /the same as this fixed quote/);
});

test("breaks target price into delivery, hidden time, and direct costs", () => {
  const quote = loadQuote({ price: 2400, delivery_hours: 24, admin_hours: 5, revision_hours: 6, overhead: 180, subcontractor_cost: 300, target_hourly_rate: 75 });
  assert.deepEqual(targetPriceBreakdown(quote), {
    delivery_labor: 1800,
    hidden_time_labor: 825,
    direct_costs: 480,
    total: 3105,
  });
});

test("share links round-trip validated quote inputs from query or fragment", () => {
  const quote = loadQuote({ currency: "EUR", price: 1800, delivery_hours: 12, admin_hours: 2.5, revision_hours: 1, overhead: 40, subcontractor_cost: 120, target_hourly_rate: 90 });
  assert.deepEqual(decodeQuote(`?${encodeQuote(quote)}`), quote);
  assert.deepEqual(decodeQuote(`#${encodeQuote(quote)}`), quote);
});

test("share links require the core quote fields", () => {
  assert.equal(decodeQuote("currency=USD&price=100"), null);
  assert.throws(() => decodeQuote("price=100&delivery_hours=2&target_hourly_rate=50&admin_hours=not-a-number"));
});

// The regression: every one of these six sat in the form, drove a rendered
// answer, and was left out of the link. Fails against the pre-fix encodeQuote,
// which took no second argument and wrote none of them.
test("share links carry the scope-creep and kill-fee panels", () => {
  const quote = loadQuote({ currency: "USD", price: 2400, delivery_hours: 24, admin_hours: 5, revision_hours: 6, overhead: 180, subcontractor_cost: 300, target_hourly_rate: 75 });
  const panels = {
    "extra-hours": 4,
    "extra-direct-costs": 0,
    hours_done: 14,
    already_paid: 1200,
    kill_fee: 360,
    sunk_costs: 180,
  };
  const encoded = encodeQuote(quote, panels);
  assert.deepEqual(decodeQuote(`#${encoded}`), quote, "the quote itself still round-trips");
  assert.deepEqual(decodePanels(`#${encoded}`), panels);
  assert.deepEqual(decodePanels(`?${encoded}`), panels, "query and fragment read alike");
});

// A link somebody already sent has no panel params. It must still open, and it
// must restore nothing rather than zeroing the recipient's panels.
test("a link without panel params restores no panels", () => {
  const quote = loadQuote({ price: 900, delivery_hours: 6, admin_hours: 1, revision_hours: 1, overhead: 0, subcontractor_cost: 0, target_hourly_rate: 60 });
  assert.deepEqual(decodePanels(`#${encodeQuote(quote)}`), {});
});

// A fragment is the one part of this page a stranger writes, so a bad panel
// value is dropped on its own without taking the rest of the bid with it.
test("panel values are validated individually, not trusted", () => {
  const base = "price=100&delivery_hours=2&target_hourly_rate=50";
  assert.deepEqual(
    decodePanels(`#${base}&hours_done=not-a-number&already_paid=-5&kill_fee=360`),
    { kill_fee: 360 },
  );
  assert.deepEqual(decodePanels("#" + base), {});
  assert.deepEqual(decodePanels(undefined), {});
});

// Encoding refuses what it cannot honestly send. A NaN written as the string
// "NaN" would arrive as an empty number input, which reads as a field the
// sender cleared rather than one that was never carried.
test("encodeQuote omits panel values it cannot send", () => {
  const quote = loadQuote({ price: 900, delivery_hours: 6, admin_hours: 1, revision_hours: 1, overhead: 0, subcontractor_cost: 0, target_hourly_rate: 60 });
  const encoded = encodeQuote(quote, { hours_done: Number.NaN, kill_fee: -1, sunk_costs: 180, already_paid: "1200" });
  assert.deepEqual(decodePanels(`#${encoded}`), { sunk_costs: 180 });
});

test("presets are valid editable starting points", () => {
  for (const preset of Object.values(QUOTE_PRESETS)) {
    const quote = loadQuote({ currency: "USD", ...preset });
    assert.ok(calculate(quote).total_hours > 0);
  }
});

test("target-rate hours budget is leftover cash divided by the supplied rate", () => {
  const quote = loadQuote({
    price: 2400,
    delivery_hours: 24,
    admin_hours: 5,
    revision_hours: 6,
    overhead: 180,
    subcontractor_cost: 300,
    target_hourly_rate: 75,
  });
  assert.equal(targetHoursBudget(quote, calculate(quote)), 25.6);
});
