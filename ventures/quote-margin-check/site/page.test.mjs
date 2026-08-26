import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadQuote, calculate, directCostSpikeScenarios, discountAskScenarios, loadKillFeeProgress, compareKillFee } from "./calc.mjs";

test("calculator page renders the cost-rise table and records the event", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /id="cost-spike"/);
  assert.match(page, /directCostSpikeScenarios/);
  assert.match(page, /directCostSpikeSummary/);
  assert.match(page, /cost_spike_compared/);
  assert.match(page, /if-costs-go-up-is-this-quote-still-alive\.html/);
  assert.match(page, /Price to hold target/);
  assert.match(page, /No warranty/);
});

test("SEO page numbers match the calculator defaults", async () => {
  const page = await readFile(new URL("./if-costs-go-up-is-this-quote-still-alive.html", import.meta.url), "utf8");
  const quote = loadQuote({
    price: 2400,
    delivery_hours: 24,
    admin_hours: 5,
    revision_hours: 6,
    overhead: 180,
    subcontractor_cost: 300,
    target_hourly_rate: 75,
  });
  const rows = directCostSpikeScenarios(quote, calculate(quote));
  const spike25 = rows.find((row) => row.percent === 25);
  assert.match(page, /\$51\.43/);
  assert.match(page, /\$3,225/);
  assert.equal(spike25.target_price, 3225);
  assert.match(page, /No warranty/);
  assert.match(page, /no SLA/);
  assert.match(page, /GitHub Sponsors/);
});

test("calculator page renders the discount-ask table and records the event", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /id="discount-ask"/);
  assert.match(page, /discountAskScenarios/);
  assert.match(page, /discountAskSummary/);
  assert.match(page, /discount_ask_compared/);
  assert.match(page, /if-they-ask-for-10-percent-off\.html/);
  assert.match(page, /Hours to cut to hold target/);
  assert.match(page, /discount_\$\{row\.percent\}_hours_to_cut/);
  assert.match(page, /No warranty/);
});

test("discount SEO page numbers match the calculator defaults", async () => {
  const page = await readFile(new URL("./if-they-ask-for-10-percent-off.html", import.meta.url), "utf8");
  const quote = loadQuote({
    price: 2400,
    delivery_hours: 24,
    admin_hours: 5,
    revision_hours: 6,
    overhead: 180,
    subcontractor_cost: 300,
    target_hourly_rate: 75,
  });
  const rows = discountAskScenarios(quote, calculate(quote));
  const ten = rows.find((row) => row.percent === 10);
  assert.match(page, /\$48\.00/);
  assert.match(page, /\$2,160/);
  assert.match(page, /12\.60 hours/);
  assert.equal(ten.discounted_price, 2160);
  assert.ok(Math.abs(ten.hours_to_cut - 12.6) < 1e-9);
  assert.match(page, /No warranty/);
  assert.match(page, /no SLA/);
  assert.match(page, /GitHub Sponsors/);
});

test("calculator page renders the kill-fee table and records the event", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /id="kill-fee"/);
  assert.match(page, /compareKillFee/);
  assert.match(page, /killFeeSummary/);
  assert.match(page, /kill_fee_compared/);
  assert.match(page, /should-i-take-this-kill-fee-or-finish\.html/);
  assert.match(page, /If you refill at target/);
  assert.match(page, /kill_finish_cash/);
  assert.match(page, /No warranty/);
});

test("kill-fee SEO page numbers match the calculator defaults", async () => {
  const page = await readFile(new URL("./should-i-take-this-kill-fee-or-finish.html", import.meta.url), "utf8");
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
  const compared = compareKillFee(
    quote,
    report,
    loadKillFeeProgress({ hours_done: 14, already_paid: 1200, kill_fee: 360, sunk_costs: 180 }, quote, report),
  );
  assert.equal(compared.finish.cash_kept, 1920);
  assert.equal(compared.kill.cash_kept, 1380);
  assert.equal(compared.kill.refill_adjusted, 2955);
  assert.match(page, /\$1,920\.00/);
  assert.match(page, /\$1,380\.00/);
  assert.match(page, /\$2,955\.00/);
  assert.match(page, /\$42\.86/);
  assert.match(page, /\$1,035\.00/);
  const alreadyPaid = compareKillFee(
    quote,
    report,
    loadKillFeeProgress({ hours_done: 8, already_paid: 2160, kill_fee: 80, sunk_costs: 180 }, quote, report),
  );
  assert.equal(alreadyPaid.kill.cash_kept, 2060);
  assert.match(page, /\$2,060\.00/);
  assert.match(page, /No warranty/);
  assert.match(page, /no SLA/);
  assert.match(page, /GitHub Sponsors/);
});

test("sitemap and robots advertise the cost-rise page", async () => {
  const sitemap = await readFile(new URL("./sitemap.xml", import.meta.url), "utf8");
  const robots = await readFile(new URL("./robots.txt", import.meta.url), "utf8");
  assert.match(sitemap, /if-costs-go-up-is-this-quote-still-alive\.html/);
  assert.match(sitemap, /if-they-ask-for-10-percent-off\.html/);
  assert.match(sitemap, /should-i-take-this-kill-fee-or-finish\.html/);
  assert.match(robots, /Sitemap: sitemap\.xml/);
});
