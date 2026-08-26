import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  parseInputs,
  computeFeeAmount,
  computeAnnualExposure,
  computeAnnualFeeRevenue,
  computeAll,
  compareFeeScenarios,
  compareNoticeWindows,
  nearestNoticeHours,
  noticeWindowSummary,
  weeklyBook,
  annualOverbookOutcome,
  compareOverbooking,
  generatePolicyText,
  buildShareUrl,
  readShareValues,
} from "../src/calc.mjs";

test("parseInputs accepts valid numeric input", () => {
  const result = parseInputs({
    price: "75",
    bookingsPerWeek: "20",
    noShowRatePct: "8",
    noticeHours: "24",
    feePercent: "100",
    enforcementRatePct: "70",
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.values, {
    price: 75,
    bookingsPerWeek: 20,
    noShowRatePct: 8,
    noticeHours: 24,
    feePercent: 100,
    enforcementRatePct: 70,
    overflowCost: 75,
    fillSameDayPct: 10,
    fillDayAheadPct: 40,
    fillTwoDayPct: 65,
  });
});

test("parseInputs rejects negative price", () => {
  const result = parseInputs({
    price: "-10",
    bookingsPerWeek: "5",
    noShowRatePct: "5",
    noticeHours: "24",
    feePercent: "50",
    enforcementRatePct: "50",
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("price")));
});

test("parseInputs rejects out-of-range percentages", () => {
  const result = parseInputs({
    price: "10",
    bookingsPerWeek: "5",
    noShowRatePct: "150",
    noticeHours: "24",
    feePercent: "-5",
    enforcementRatePct: "200",
  });
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 3);
});

test("parseInputs rejects non-numeric input", () => {
  const result = parseInputs({
    price: "abc",
    bookingsPerWeek: "5",
    noShowRatePct: "5",
    noticeHours: "24",
    feePercent: "50",
    enforcementRatePct: "50",
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("price")));
});

test("computeFeeAmount computes a percentage of price", () => {
  assert.equal(computeFeeAmount({ price: 75, feePercent: 100 }), 75);
  assert.equal(computeFeeAmount({ price: 80, feePercent: 50 }), 40);
  assert.equal(computeFeeAmount({ price: 33.33, feePercent: 10 }), 3.33);
});

test("computeAnnualExposure scales bookings, rate, and 52 weeks", () => {
  const { noShowsPerYear, annualLostRevenue } = computeAnnualExposure({
    price: 75,
    bookingsPerWeek: 20,
    noShowRatePct: 8,
  });
  // 20 * 0.08 * 52 = 83.2
  assert.equal(noShowsPerYear, 83.2);
  assert.equal(annualLostRevenue, 6240);
});

test("computeAnnualExposure is zero when no-show rate is zero", () => {
  const { noShowsPerYear, annualLostRevenue } = computeAnnualExposure({
    price: 100,
    bookingsPerWeek: 20,
    noShowRatePct: 0,
  });
  assert.equal(noShowsPerYear, 0);
  assert.equal(annualLostRevenue, 0);
});

test("computeAnnualFeeRevenue applies the enforcement rate", () => {
  const revenue = computeAnnualFeeRevenue({
    feeAmount: 75,
    noShowsPerYear: 83.2,
    enforcementRatePct: 70,
  });
  // 75 * 83.2 * 0.7 = 4368
  assert.equal(revenue, 4368);
});

test("computeAnnualFeeRevenue is bounded by full enforcement", () => {
  const full = computeAnnualFeeRevenue({ feeAmount: 50, noShowsPerYear: 10, enforcementRatePct: 100 });
  const half = computeAnnualFeeRevenue({ feeAmount: 50, noShowsPerYear: 10, enforcementRatePct: 50 });
  assert.equal(full, 500);
  assert.equal(half, 250);
  assert.ok(half < full);
});

test("computeAll composes the individual calculations consistently", () => {
  const values = {
    price: 75,
    bookingsPerWeek: 20,
    noShowRatePct: 8,
    noticeHours: 24,
    feePercent: 100,
    enforcementRatePct: 70,
  };
  const result = computeAll(values);
  assert.equal(result.feeAmount, computeFeeAmount(values));
  const exposure = computeAnnualExposure(values);
  assert.equal(result.noShowsPerYear, exposure.noShowsPerYear);
  assert.equal(result.annualLostRevenue, exposure.annualLostRevenue);
  assert.equal(
    result.annualFeeRevenue,
    computeAnnualFeeRevenue({
      feeAmount: result.feeAmount,
      noShowsPerYear: result.noShowsPerYear,
      enforcementRatePct: values.enforcementRatePct,
    }),
  );
});

test("compareFeeScenarios shows standard levels and preserves a custom selection", () => {
  const scenarios = compareFeeScenarios({ price: 80, bookingsPerWeek: 10, noShowRatePct: 10, feePercent: 60, enforcementRatePct: 50 });
  assert.deepEqual(scenarios.map(({ feePercent }) => feePercent), [50, 60, 75, 100]);
  assert.deepEqual(scenarios.map(({ feeAmount }) => feeAmount), [40, 48, 60, 80]);
  assert.deepEqual(scenarios.map(({ annualFeeRevenue }) => annualFeeRevenue), [1040, 1248, 1560, 2080]);
});

test("compareFeeScenarios does not duplicate a standard selected level", () => {
  const scenarios = compareFeeScenarios({ price: 100, bookingsPerWeek: 1, noShowRatePct: 10, feePercent: 75, enforcementRatePct: 100 });
  assert.deepEqual(scenarios.map(({ feePercent }) => feePercent), [50, 75, 100]);
});

test("compareNoticeWindows recovers more empty-slot cash at a higher fill rate", () => {
  const rows = compareNoticeWindows({
    price: 75,
    bookingsPerWeek: 20,
    noShowRatePct: 8,
    noticeHours: 24,
    fillSameDayPct: 10,
    fillDayAheadPct: 40,
    fillTwoDayPct: 65,
  });
  // 20 * 0.08 * 52 = 83.2 no-shows; 83.2 * 75 = 6240 of empty-slot cash.
  assert.deepEqual(rows.map(({ hours }) => hours), [4, 24, 48]);
  assert.equal(rows[0].slotsFilled, 8.32);
  assert.equal(rows[0].recoveredByRefill, 624);
  assert.equal(rows[0].leftoverLost, 5616);
  assert.equal(rows[0].extraVsSameDay, 0);
  assert.equal(rows[1].slotsFilled, 33.28);
  assert.equal(rows[1].recoveredByRefill, 2496);
  assert.equal(rows[1].leftoverLost, 3744);
  assert.equal(rows[1].extraVsSameDay, 1872);
  assert.equal(rows[1].selected, true);
  assert.equal(rows[1].nearest, true);
  assert.equal(rows[2].slotsFilled, 54.08);
  assert.equal(rows[2].recoveredByRefill, 4056);
  assert.equal(rows[2].leftoverLost, 2184);
  assert.equal(rows[2].extraVsSameDay, 3432);
  assert.equal(rows[2].selected, false);
});

test("compareNoticeWindows does not invent a waitlist when every fill rate is zero", () => {
  const rows = compareNoticeWindows({
    price: 100,
    bookingsPerWeek: 10,
    noShowRatePct: 10,
    noticeHours: 48,
    fillSameDayPct: 0,
    fillDayAheadPct: 0,
    fillTwoDayPct: 0,
  });
  assert.ok(rows.every((row) => row.recoveredByRefill === 0 && row.extraVsSameDay === 0));
  assert.equal(rows[2].selected, true);
});

test("nearestNoticeHours picks the closest standard window", () => {
  assert.equal(nearestNoticeHours(24), 24);
  assert.equal(nearestNoticeHours(4), 4);
  assert.equal(nearestNoticeHours(36), 24);
  assert.equal(nearestNoticeHours(12), 4);
});

test("noticeWindowSummary names the extra cash a 48-hour window recovers", () => {
  const rows = compareNoticeWindows({
    price: 75,
    bookingsPerWeek: 20,
    noShowRatePct: 8,
    noticeHours: 24,
    fillSameDayPct: 10,
    fillDayAheadPct: 40,
    fillTwoDayPct: 65,
  });
  const text = noticeWindowSummary(rows);
  assert.match(text, /\$3432\.00 more/);
  assert.match(text, /\$1872\.00 more/);
  assert.match(text, /does not refill the chair/);
});

test("noticeWindowSummary stays honest when a longer window does not refill more", () => {
  const rows = compareNoticeWindows({
    price: 80,
    bookingsPerWeek: 5,
    noShowRatePct: 10,
    noticeHours: 24,
    fillSameDayPct: 20,
    fillDayAheadPct: 20,
    fillTwoDayPct: 20,
  });
  assert.match(noticeWindowSummary(rows), /does not recover more/);
});

test("parseInputs rejects an out-of-range waitlist fill rate", () => {
  const result = parseInputs({
    price: "75",
    bookingsPerWeek: "20",
    noShowRatePct: "8",
    noticeHours: "24",
    feePercent: "100",
    enforcementRatePct: "70",
    fillTwoDayPct: "150",
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("48-hour waitlist fill rate")));
});

const DEFAULT_OVERBOOK = {
  price: 75,
  bookingsPerWeek: 20,
  noShowRatePct: 8,
  feePercent: 100,
  enforcementRatePct: 70,
  overflowCost: 75,
};

function assertClose(actual, expected) {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `expected ${expected}, got ${actual}`,
  );
}

test("weeklyBook matches capacity when nobody extra is booked", () => {
  const week = weeklyBook(DEFAULT_OVERBOOK, 0);
  assert.equal(week.booked, 20);
  assertClose(week.expectedArrivals, 18.4);
  assertClose(week.served, 18.4);
  assert.equal(week.overflow, 0);
  assertClose(week.empty, 1.6);
  assertClose(week.noShows, 1.6);
});

test("weeklyBook matching expected no-shows almost fills the mean week", () => {
  const week = weeklyBook(DEFAULT_OVERBOOK, 1.6);
  assertClose(week.booked, 21.6);
  assertClose(week.expectedArrivals, 19.872);
  assertClose(week.served, 19.872);
  assert.equal(week.overflow, 0);
  assert.ok(week.empty < 0.2);
});

test("weeklyBook at 150% of expected no-shows overflows the mean", () => {
  const week = weeklyBook(DEFAULT_OVERBOOK, 2.4);
  assert.equal(week.served, 20);
  assertClose(week.overflow, 0.608);
  assert.equal(week.empty, 0);
});

test("weeklyBook rejects a negative extra book", () => {
  assert.throws(() => weeklyBook(DEFAULT_OVERBOOK, -1), /cannot be negative/);
});

test("annualOverbookOutcome composes service, fee, and overflow cost", () => {
  const feeOnly = annualOverbookOutcome(DEFAULT_OVERBOOK, { extraBookingsPerWeek: 0, collectFee: true });
  assert.equal(feeOnly.serviceRevenue, 71760);
  assert.equal(feeOnly.feeRevenue, 4368);
  assert.equal(feeOnly.overflowCostAnnual, 0);
  assert.equal(feeOnly.netKept, 76128);

  const match = annualOverbookOutcome(DEFAULT_OVERBOOK, { extraBookingsPerWeek: 1.6, collectFee: true });
  assert.equal(match.serviceRevenue, 77500.8);
  assert.equal(match.feeRevenue, 4717.44);
  assert.equal(match.netKept, 82218.24);

  const aggressive = annualOverbookOutcome(DEFAULT_OVERBOOK, { extraBookingsPerWeek: 2.4, collectFee: true });
  assert.equal(aggressive.serviceRevenue, 78000);
  assert.equal(aggressive.overflowCostAnnual, 2371.2);
  assert.equal(aggressive.netKept, 80520.96);
});

test("compareOverbooking prefers matching the no-show rate plus the fee on the defaults", () => {
  const comparison = compareOverbooking(DEFAULT_OVERBOOK);
  assert.equal(comparison.expectedNoShowsPerWeek, 1.6);
  assert.equal(comparison.winner, "overbook_1");
  assert.equal(comparison.extraVsFeeOnly, 6090.24);
  assert.equal(comparison.rows[2].withFee.netKept, 82218.24);
  assert.equal(comparison.matchNoFee.netKept, 77500.8);
  assert.ok(comparison.matchNoFee.netKept > comparison.feeOnly.netKept);
  assert.match(comparison.summary, /\$6090\.24 more/);
});

test("compareOverbooking picks the aggressive book when overflow is priced at zero", () => {
  const comparison = compareOverbooking({ ...DEFAULT_OVERBOOK, overflowCost: 0 });
  assert.equal(comparison.winner, "overbook_1_5");
  assert.ok(comparison.rows[3].withFee.netKept > comparison.rows[2].withFee.netKept);
});

test("compareOverbooking stays on the fee-only book when nobody no-shows", () => {
  const comparison = compareOverbooking({ ...DEFAULT_OVERBOOK, noShowRatePct: 0 });
  assert.equal(comparison.expectedNoShowsPerWeek, 0);
  assert.equal(comparison.winner, "fee_only");
  assert.equal(comparison.extraVsFeeOnly, 0);
  assert.equal(comparison.rows[3].extraBookingsPerWeek, 0);
  assert.match(comparison.summary, /No-show rate is 0%/);
});

test("parseInputs defaults overflow cost to the session price", () => {
  const result = parseInputs({
    price: "80",
    bookingsPerWeek: "10",
    noShowRatePct: "10",
    noticeHours: "24",
    feePercent: "50",
    enforcementRatePct: "50",
  });
  assert.equal(result.ok, true);
  assert.equal(result.values.overflowCost, 80);
});

test("parseInputs accepts an explicit zero overflow cost", () => {
  const result = parseInputs({ ...VALID_RAW, overflowCost: "0" });
  assert.equal(result.ok, true);
  assert.equal(result.values.overflowCost, 0);
});

test("parseInputs rejects a negative overflow cost", () => {
  const result = parseInputs({ ...VALID_RAW, overflowCost: "-5" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("overflow")));
});

test("generatePolicyText includes the fee, notice window, and non-warranty note", () => {
  const text = generatePolicyText({
    businessName: "Riverside Training",
    serviceName: "session",
    noticeHours: 20,
    feePercent: 100,
    feeAmount: 75,
  });
  assert.match(text, /Riverside Training/);
  assert.match(text, /20 hours/);
  assert.match(text, /100% of the session price \(\$75\.00\)/);
  assert.match(text, /not a finished legal document/);
});

test("generatePolicyText supports a selected currency symbol", () => {
  const text = generatePolicyText({
    businessName: "Riverside Training",
    serviceName: "session",
    noticeHours: 24,
    feePercent: 50,
    feeAmount: 37.5,
    currencySymbol: "€",
  });
  assert.match(text, /50% of the session price \(€37\.50\)/);
});

test("generatePolicyText falls back to placeholders when name/service are blank", () => {
  const text = generatePolicyText({
    businessName: "",
    serviceName: "",
    noticeHours: 48,
    feePercent: 50,
    feeAmount: 25,
  });
  assert.match(text, /\[Your business name\]/);
  assert.match(text, /appointment/);
  assert.match(text, /2 days/);
});

test("generatePolicyText always ends with the non-warranty disclaimer", () => {
  const text = generatePolicyText({ noticeHours: 24, feePercent: 100, feeAmount: 10 });
  assert.ok(text.trim().endsWith("before publishing it to clients."));
});

test("buildShareUrl encodes supported inputs without server state", () => {
  const url = buildShareUrl({ currency: "EUR", price: "75", bookingsPerWeek: "20", noShowRatePct: "8", noticeHours: "24", feePercent: "100", enforcementRatePct: "70", businessName: "Riverside & Co", serviceName: "training session", ignored: "secret" }, "https://example.test/calculator");
  assert.equal(url, "https://example.test/calculator?currency=EUR&price=75&bookingsPerWeek=20&noShowRatePct=8&noticeHours=24&feePercent=100&enforcementRatePct=70&businessName=Riverside+%26+Co&serviceName=training+session");
  assert.equal(url.includes("ignored"), false);
});

test("readShareValues returns only supported parameters", () => {
  assert.deepEqual(readShareValues("https://example.test/?price=75&feePercent=100&unknown=bad"), { price: "75", feePercent: "100" });
});

test("index.html's embedded JSON-LD blocks are valid JSON", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(path.join(here, "..", "index.html"), "utf8");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length >= 2, "expected at least a SoftwareApplication and a FAQPage block");
  for (const [, json] of blocks) {
    const parsed = JSON.parse(json);
    assert.ok(parsed["@context"] === "https://schema.org");
  }
});

test("index.html contains the required disclaimer wording", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(path.join(here, "..", "index.html"), "utf8");
  assert.match(html, /No warranty\./);
  assert.match(html, /not legal, tax, or financial\s*\n?\s*advice/);
  assert.match(html, /Best-effort hosting, no SLA/);
});
// --------------------------------------------------------------------------
// Missing input is not the number zero.
//
// `Number("")` is 0, and 0 passes every range check in parseInputs, so a
// cleared field used to validate as a deliberate zero: the calculator answered
// "$0.00 suggested fee" with no error shown. Now that the page recalculates as
// the visitor types, that path is reached by anyone who clears a field to
// retype it, so it is worth pinning in both directions.
// --------------------------------------------------------------------------

const VALID_RAW = {
  price: "75",
  bookingsPerWeek: "20",
  noShowRatePct: "8",
  noticeHours: "24",
  feePercent: "100",
  enforcementRatePct: "70",
};

for (const field of Object.keys(VALID_RAW)) {
  test(`parseInputs rejects an empty ${field} rather than reading it as zero`, () => {
    const result = parseInputs({ ...VALID_RAW, [field]: "" });
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some((e) => e.includes("required")),
      `expected a "required" error for ${field}, got ${JSON.stringify(result.errors)}`,
    );
  });

  test(`parseInputs rejects a whitespace-only ${field}`, () => {
    assert.equal(parseInputs({ ...VALID_RAW, [field]: "   " }).ok, false);
  });

  test(`parseInputs rejects a missing ${field}`, () => {
    const raw = { ...VALID_RAW };
    delete raw[field];
    assert.equal(parseInputs(raw).ok, false);
  });
}

test("parseInputs still accepts a deliberate zero", () => {
  // The distinction being drawn is absent vs. zero, so an explicit "0" has to
  // keep working -- a business with no no-shows yet is a real case.
  const result = parseInputs({ ...VALID_RAW, noShowRatePct: "0" });
  assert.equal(result.ok, true);
  assert.equal(result.values.noShowRatePct, 0);
});

// --------------------------------------------------------------------------
// Page wiring.
//
// The cut-list optimizer shipped with an unclosed <textarea> that swallowed its
// own <script> tag, so the tool never calculated anything -- and its unit tests
// stayed green the whole time because they imported calc.mjs and never looked
// at the page. These assert that this venture's markup and its script agree.
// --------------------------------------------------------------------------

function readHtml() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return readFileSync(path.join(here, "..", "index.html"), "utf8");
}

function readApp() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return readFileSync(path.join(here, "..", "src", "app.mjs"), "utf8");
}

test("index.html loads the module script after the markup it queries", () => {
  const html = readHtml();
  const scriptIndex = html.indexOf('<script type="module" src="src/app.mjs">');
  assert.ok(scriptIndex > 0, "src/app.mjs is not loaded as a module script");
  assert.ok(html.indexOf('id="calc-form"') < scriptIndex, "the form must be parsed before the script");
});

test("every id src/app.mjs looks up exists in index.html", () => {
  const html = readHtml();
  const ids = [...readApp().matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(ids.length > 0, "expected app.mjs to query some ids");
  for (const id of new Set(ids)) {
    assert.ok(
      html.includes(`id="${id}"`),
      `src/app.mjs queries #${id}, which does not exist in index.html`,
    );
  }
});

test("raw-text elements in index.html are closed", () => {
  // The exact cut-list failure: <textarea> and <script> are raw-text elements,
  // so an unclosed one makes the browser swallow the rest of the document as
  // literal text and the page silently stops working.
  const html = readHtml();
  for (const tag of ["textarea", "script", "title"]) {
    const opens = (html.match(new RegExp(`<${tag}[\\s>]`, "gi")) || []).length;
    const closes = (html.match(new RegExp(`</${tag}>`, "gi")) || []).length;
    assert.equal(opens, closes, `<${tag}> opened ${opens} time(s) but closed ${closes}`);
  }
});

test("the results panel is revealed by script rather than shipped visible", () => {
  // It must start hidden so a visitor without JavaScript sees the form instead
  // of a row of $0.00 placeholders that will never fill in -- and app.mjs must
  // be the thing that unhides it, or the page opens showing nothing.
  assert.match(readHtml(), /<div id="results" hidden/);
  assert.match(readApp(), /resultsEl\.hidden = false/);
});

test("app.mjs computes on load instead of waiting for a submit", () => {
  // The whole point of this page is a specific number, so one should be on
  // screen before the visitor does anything. Checked structurally: the module's
  // epilogue -- everything after the last listener is registered, which is code
  // that runs at import time -- has to paint a result.
  const app = readApp();
  const epilogue = app.slice(app.lastIndexOf("addEventListener("));
  assert.ok(
    /\brender\(\);/.test(epilogue) || /\bcountCalculation\(\);/.test(epilogue),
    "nothing renders at import time, so the page would open with no result",
  );
});

test("the overbooking landing page quotes the same default arithmetic", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(path.join(here, "..", "should-i-overbook-or-charge-a-no-show-fee.html"), "utf8");
  const comparison = compareOverbooking(DEFAULT_OVERBOOK);
  assert.match(html, /\$76,128/);
  assert.match(html, /\$82,218\.24/);
  assert.match(html, /\$6,090\.24/);
  assert.equal(comparison.feeOnly.netKept, 76128);
  assert.equal(comparison.rows[2].withFee.netKept, 82218.24);
  assert.equal(comparison.extraVsFeeOnly, 6090.24);
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length >= 1);
  for (const [, json] of blocks) {
    assert.equal(JSON.parse(json)["@context"], "https://schema.org");
  }
});

test("index.html and app.mjs wire the notice-window comparison", () => {
  const html = readHtml();
  const app = readApp();
  assert.match(html, /id="notice-section"/);
  assert.match(html, /id="notice-body"/);
  assert.match(html, /id="notice-summary"/);
  assert.match(html, /id="fillSameDayPct"/);
  assert.match(html, /id="fillDayAheadPct"/);
  assert.match(html, /id="fillTwoDayPct"/);
  assert.match(html, /24h-vs-48h-cancellation-notice\.html/);
  assert.match(app, /compareNoticeWindows/);
  assert.match(app, /notice_windows_compared/);
});

test("index.html and app.mjs wire the overbooking table", () => {
  const html = readHtml();
  const app = readApp();
  assert.match(html, /id="overbook-section"/);
  assert.match(html, /id="overbook-body"/);
  assert.match(html, /id="overflowCost"/);
  assert.match(html, /should-i-overbook-or-charge-a-no-show-fee\.html/);
  assert.match(app, /compareOverbooking/);
  assert.match(app, /overbooking_compared/);
});

test("app.mjs does not count usage on every keystroke", () => {
  // A usage log that ticks per keystroke measures typing, not calculations.
  // The `input` listener must render only; counting belongs on `change`.
  const app = readApp();
  const inputListener = app.match(/addEventListener\("input",([\s\S]*?)\);/);
  assert.ok(inputListener, "expected an input listener");
  assert.ok(
    !inputListener[1].includes("recordEvent") && !inputListener[1].includes("countCalculation"),
    "the input listener must not record usage",
  );
});
