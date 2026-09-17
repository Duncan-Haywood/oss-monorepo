import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadQuote, calculate, directCostSpikeScenarios, discountAskScenarios, compareBillingModels, loadKillFeeProgress, compareKillFee } from "./calc.mjs";

test("calculator page prices extra scope as a change-order floor", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /id="change-order"/);
  assert.match(page, /id="extra-hours"/);
  assert.match(page, /changeOrderPrice/);
  assert.match(page, /change_order_checked/);
  assert.match(page, /arithmetic floor/);
});

test("calculator page prices a time-buffered target", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /id="time_buffer_percent"/);
  assert.match(page, /buffered_target_price/);
  assert.match(page, /time_buffer_compared/);
});

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
  assert.match(page, /id="copy-discounts"/);
  assert.match(page, /Copy discount ladder/);
  assert.match(page, /discountAskScenarios/);
  assert.match(page, /discountAskSummary/);
  assert.match(page, /discount_ask_compared/);
  assert.match(page, /discount_ladder_copied/);
  assert.match(page, /if-they-ask-for-10-percent-off\.html/);
  assert.match(page, /Hours to cut to hold target/);
  assert.match(page, /quoteCsv/);
  assert.match(page, /discountRows: discountAskScenarios/);
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
  assert.match(page, /compared/);
  assert.match(page, /id="download-csv"/);
  assert.match(page, /csv_downloaded/);
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
  assert.match(sitemap, /should-i-send-a-fixed-quote-or-bill-hourly\.html/);
  assert.match(sitemap, /should-i-take-this-kill-fee-or-finish\.html/);
  assert.match(sitemap, /effective-hourly-rate\.html/);
  assert.match(sitemap, /vs-bonsai\.html/);
  assert.match(robots, /Sitemap: sitemap\.xml/);
});

test("calculator page declares a canonical URL in both link and Open Graph form", async () => {
  // A share card built only from og:title/og:description has no URL of its
  // own, so the two must agree rather than only the <link> carrying it.
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /<link rel="canonical" href="\." \/>/);
  assert.match(page, /<meta property="og:url" content="\." \/>/);
});

test("effective-rate guide matches calculator defaults and carries disclaimers", async () => {
  const page = await readFile(new URL("./effective-hourly-rate.html", import.meta.url), "utf8");
  const index = await readFile(new URL("./index.html", import.meta.url), "utf8");
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
  assert.equal(report.total_hours, 35);
  assert.equal(report.direct_costs, 480);
  assert.equal(Number(report.effective_hourly_rate.toFixed(2)), 54.86);
  assert.equal(report.target_price, 3105);
  assert.match(page, /\$54\.86/);
  assert.match(page, /\$3,105/);
  assert.match(page, /No warranty/);
  assert.match(page, /no SLA/);
  assert.match(page, /GitHub Sponsors/);
  assert.doesNotMatch(page, /should raise|must quote|recommend a price/);
  assert.match(index, /effective-hourly-rate\.html/);
});

test("calculator page persists a local draft and can reset it", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /id="clear-draft"/);
  assert.match(page, /from "\.\/draft\.mjs"/);
  assert.match(page, /draft_restored/);
  assert.match(page, /draft_reset/);
  assert.match(page, /Reset to example/);
});

test("calculator page can export and import a portable draft file", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /id="download-draft"/);
  assert.match(page, /id="import-draft"/);
  assert.match(page, /from "\.\/drafts\.mjs"/);
  assert.match(page, /draft_exported/);
  assert.match(page, /draft_imported/);
  assert.match(page, /draftFileName/);
  assert.match(page, /Download draft/);
});

test("calculator page can download a private plain-text review summary", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /id="download-summary"/);
  assert.match(page, /Download review summary/);
  assert.match(page, /quote-margin-review\.txt/);
  assert.match(page, /review_summary_downloaded/);
  assert.match(page, /formatReviewSummary/);
});

test("calculator page can download a local JSON report", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /id="download-report"/);
  assert.match(page, /from "\.\/report\.mjs"/);
  assert.match(page, /report_downloaded/);
  assert.match(page, /quote-margin-report\.json/);
});

test("calculator page can save local review history", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /id="save-history"/);
  assert.match(page, /id="history-list"/);
  assert.match(page, /from "\.\/history\.mjs"/);
  assert.match(page, /history_saved/);
  assert.match(page, /history_deleted/);
  assert.match(page, /history_cleared/);
});

test("offers portable Markdown review actions", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /id="copy-markdown"/);
  assert.match(page, /id="download-markdown"/);
  assert.match(page, /from "\.\/markdown\.mjs"/);
  assert.match(page, /markdown_copied/);
  assert.match(page, /markdown_downloaded/);
  assert.match(page, /quote-margin-review\.md/);
});

test("calculator page renders a target-rate price ladder", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /id="ladder"/);
  assert.match(page, /targetRateLadder/);
  assert.match(page, /rate_ladder_compared/);
  assert.match(page, /Price ladder/);
});

test("calculator page records a local send, revise, or hold after the review", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /reviewDecision/);
  assert.match(page, /data-decision="send"/);
  assert.match(page, /data-decision="revise"/);
  assert.match(page, /data-decision="hold"/);
  assert.match(page, /quote_decision_\$\{action\}/);
  assert.match(page, /I'll send it/);
});

test("calculator page copies a fragment share link and prefers it over a local draft", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /id="copy-share-link"/);
  assert.match(page, /encodeQuote/);
  assert.match(page, /decodeQuote/);
  assert.match(page, /url\.hash = encodeQuote/);
  assert.match(page, /share_link_copied/);
  assert.match(page, /decodeQuote\(window\.location\.hash\)/);
});

test("calculator page copies a proposal-ready review summary", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /id="copy-summary"/);
  assert.match(page, /formatReviewSummary/);
  assert.match(page, /overrunRows: overrunScenarios/);
  assert.match(page, /review_summary_copied/);
  assert.match(page, /Copy review summary/);
  assert.match(page, /function fallbackCopy/);
  assert.match(page, /execCommand\("copy"\)/);
});

test("calculator page renders the fixed-vs-hourly comparison and records the event", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /id="billing"/);
  assert.match(page, /compareBillingModels/);
  assert.match(page, /billingModelNote/);
  assert.match(page, /billing_model_compared/);
  assert.match(page, /should-i-send-a-fixed-quote-or-bill-hourly\.html/);
  assert.match(page, /Hourly minus fixed/);
  assert.match(page, /No warranty/);
});

test("fixed-vs-hourly SEO page numbers match the calculator defaults", async () => {
  const page = await readFile(new URL("./should-i-send-a-fixed-quote-or-bill-hourly.html", import.meta.url), "utf8");
  const quote = loadQuote({
    price: 2400,
    delivery_hours: 24,
    admin_hours: 5,
    revision_hours: 6,
    overhead: 180,
    subcontractor_cost: 300,
    target_hourly_rate: 75,
  });
  const rows = compareBillingModels(quote, calculate(quote));
  const planned = rows.find((row) => row.percent === 0);
  const plus50 = rows.find((row) => row.percent === 50);
  assert.equal(planned.hourly_total, 3105);
  assert.equal(planned.hourly_minus_fixed, 705);
  assert.equal(plus50.hourly_total, 4417.5);
  assert.match(page, /\$3,105\.00/);
  assert.match(page, /\$705\.00/);
  assert.match(page, /\$4,417\.50/);
  assert.match(page, /\$2,017\.50/);
  assert.match(page, /\$36\.57/);
  assert.match(page, /not a recommendation/);
  assert.doesNotMatch(page, /should send hourly|must bill hourly|switch to hourly/i);
  assert.match(page, /No warranty/);
  assert.match(page, /no SLA/);
  assert.match(page, /GitHub Sponsors/);
});

test("calculator page offers editable quote starting points, not recommendations", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /id="preset"/);
  assert.match(page, /QUOTE_PRESETS/);
  assert.match(page, /quote_preset_selected/);
  assert.match(page, /editable examples, not pricing recommendations/);
  assert.doesNotMatch(page, /should use this preset|must start from/i);
});

test("calculator page shows the target-rate hours budget without recommending a cut", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /r\.target_rate_hours/);
  assert.match(page, /Hours supported at target rate/);
  assert.match(page, /hours_budget_shown/);
  assert.doesNotMatch(page, /should cut hours|must reduce scope/i);
});

test("the hours-budget field says none rather than a negative hour count", async () => {
  // The dl renders r.target_rate_hours, which is signed and goes negative once
  // direct costs pass the price. Guard the branch that catches that here: the
  // dl is built by a template literal, so calc.test.mjs stays green whatever
  // this field renders.
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /r\.cost_coverage <= 0 \? `none — direct costs leave nothing to pay for time`/);
});

test("a rejected quote clears the stale overrun-sensitivity table along with its sibling panels", async () => {
  // The main catch block clears result/review/decision/ladder/costSpike/
  // discountAsk/billing/killFee/targetBreakdown on a rejected input, but
  // left the "If the work takes longer" (#sensitivity) overrun table
  // showing the last valid scenario rows -- the one panel in that list with
  // no corresponding clear. A visitor who missed the error message could
  // read those stale overrun figures as the answer for the invalid quote
  // now on screen.
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const catchMatch = page.match(/\} catch \(err\) \{([\s\S]*?)\n {4}\}\n {2}\}/);
  assert.ok(catchMatch, "the main calculate() catch block was not found");
  const body = catchMatch[1];
  assert.match(body, /result\.textContent = err\.message/, "the error message is never shown");
  assert.match(body, /sensitivity\.querySelector\("tbody"\)\.innerHTML = ""/, "#sensitivity keeps its stale overrun rows instead of being cleared");
});

test("a saved review can be loaded back into the form, not only deleted", async () => {
  // history.mjs could save and delete a review but never restore one, so the
  // "compare recurring proposals" saved-reviews list was write-only: a
  // freelancer with 12 saved quotes had no way to bring an old one back into
  // the form to re-check or re-send it without retyping every field.
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /data-history-load/, "no load control is rendered per saved review");
  assert.match(page, /recordEvent\("history_loaded"\)/, "loading a saved review is not counted");
  const loadHandler = page.match(/const loadButton = event\.target\.closest\("\[data-history-load\]"\);([\s\S]*?)\n {4}\}\n {4}const deleteButton/);
  assert.ok(loadHandler, "the history click handler has no load branch");
  const body = loadHandler[1];
  assert.match(body, /for \(const id of ids\)/, "load does not restore every quote field");
  assert.match(body, /el\[id\]\.value = String\(entry\.quote\[id\]\)/, "load does not write the saved values into the inputs");
  assert.match(body, /update\(\)/, "load does not recompute the report after restoring the fields");
});

test("every scenario panel on the page reports a usage signal of its own", async () => {
  // The overrun table shipped without one, so nothing recorded whether the
  // time-overrun view was ever read while every panel beside it was counted.
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  for (const event of [
    "overrun_sensitivity_compared",
    "cost_spike_compared",
    "discount_ask_compared",
    "billing_model_compared",
    "rate_ladder_compared",
    "hours_budget_shown",
  ]) {
    assert.match(page, new RegExp(`recordEvent\\("${event}"\\)`), `${event} is not recorded`);
  }
});
