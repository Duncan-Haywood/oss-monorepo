// Pilot pages (backlog P054) open with a one-sentence direct answer that names
// its primary source and an as-of date. AI answer engines quote a page that
// states a fact plainly with its provenance; a lead whose number drifts from
// the venture's calculator would quote a wrong figure. So each dollar figure in
// a lead must be one the venture's own calc module exports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../ventures/', import.meta.url);

// slug -> figures (from the venture's calc module) that the lead may state.
const PILOTS = {
  '1099-k-threshold-checker': async (m) => {
    const t = m.federalThreshold(2026);
    const y24 = m.federalThreshold(2024);
    return [t.amount, y24.amount];
  },
  'hsa-contribution-limit-calculator': async (m) => [
    m.LIMITS_2026.self.annual, m.LIMITS_2026.family.annual, m.CATCH_UP_55_PLUS,
  ],
  'exempt-salary-threshold-checker': async (m) => [
    m.FEDERAL_WEEKLY_THRESHOLD, m.weeklyToAnnual(m.FEDERAL_WEEKLY_THRESHOLD),
    ...Object.values(m.STATE_THRESHOLDS).filter((s) => s.weekly).map((s) => s.weekly),
  ],
  'discogs-fee-calculator': async (m) => [m.SELLING_FEE_MIN, m.SELLING_FEE_MAX],
  'grailed-fee-calculator': async (m) => [m.TIER_THRESHOLD, m.MIN_COMMISSION],
  'facebook-marketplace-fee-calculator': async (m) => [m.MIN_FEE, 0], // 0: local pickup carries no fee
  'depop-fee-calculator': async (m) => [m.REGIONS.us.processingFixed],
  'mercari-fee-calculator': async (m) => [m.LEGACY_PROCESSING_FIXED],
  'kickstarter-fee-calculator': async (m) => [
    m.MICRO_PLEDGE_THRESHOLD, m.STANDARD_PROCESSING_FLAT, m.MICRO_PROCESSING_FLAT,
  ],
  'ebay-fee-calculator': async (m) => [m.DEFAULT_COMBINED_FIXED_FEE, 7500], // 7500: the cap the 13.6% rate applies up to
  'reverb-fee-calculator': async (m) => [m.DEFAULT_MARKETPLACE_FEE_CAP, m.REVERB_DEFAULTS.paymentFixed, 15000, 750], // 15000 and 750: the worked example in the lead (5% of 15000)
  'tcgplayer-fee-calculator': async (m) => [m.COMMISSION_CAP, m.TRANSACTION_FIXED, 1],
  'patreon-fee-calculator': async (m) => [m.STANDARD_PROCESSING.fixed, m.MICRO_THRESHOLD],
  'music-distribution-fee-calculator': async (m) => [m.PRESETS[0].planFee, m.PRESETS[2].releaseFee, m.PRESETS[2].commissionPercent], // DistroKid plan, CD Baby single fee and cut
  'shopify-fee-calculator': async (m) => [
    m.PLAN_PRESETS.basic.monthlyPlan, m.PLAN_PRESETS.grow.monthlyPlan, m.PLAN_PRESETS.advanced.monthlyPlan, m.PLAN_PRESETS.basic.paymentsFixed,
  ],
  'ucr-fee-calculator': async (m) => m.parseFees(m.DEFAULT_FEES_TEXT).brackets.map((b) => b.fee),
  'amazon-fba-calculator': async (m) => [m.SELLER_PLAN_DEFAULTS.individualPerUnit, m.SELLER_PLAN_DEFAULTS.professionalMonthly],
  'card-processing-fee-audit': async (m) => [m.STRIPE_STANDARD_PUBLISHED.perTransaction],
  'freelance-platform-fee-calculator': async (m) => [100, 100 - m.FIVERR_FEE_PERCENT], // 100: the worked example order in the lead
  'course-platform-fee-calculator': async (m) => [m.PRESETS[0].txFlat, m.PRESETS[2].monthlyFee], // Gumroad flat per-sale fee, Podia paid plan
  'merchant-of-record-fee-calculator': async (m) => [m.DEFAULT_PROVIDERS.paddle.fixed, m.DEFAULT_PROVIDERS.polar.fixed], // Paddle/Lemon Squeezy and Polar per-transaction fixed fees
  '401k-loan-vs-withdrawal-calculator': async (m) => [m.LOAN_FLOOR, m.LOAN_CAP], // statutory loan floor and cap, IRC 72(p)(2)
  'poshmark-fee-calculator': async (m) => [m.FLAT_FEE, m.COMMISSION_THRESHOLD, m.BREAK_EVEN_PRICE],
  '529-to-roth-rollover-calculator': async (m) => [m.DEFAULTS.lifetimeCap], // statutory lifetime cap, IRC 529(c)(3)(E)
  'child-tax-credit-calculator': async (m) => [m.CTC_PER_CHILD, m.ODC_PER_DEPENDENT, m.ACTC_CAP_PER_CHILD, m.PHASEOUT_THRESHOLD_OTHER, m.PHASEOUT_THRESHOLD_JOINT],
  'dependent-care-fsa-vs-credit-calculator': async (m) => [m.FSA_LIMIT, m.CAP_ONE, m.CAP_TWO, m.FSA_LIMIT / 2, 5000], // FSA limit, credit caps, separate-return half, and the pre-2026 FSA limit named as context; 26 USC 129 and 21
  'home-office-deduction-calculator': async (m) => [m.SIMPLIFIED_RATE, m.SIMPLIFIED_MAX_SQFT, m.SIMPLIFIED_MAX],
  'estate-tax-exemption-calculator': async (m) => [m.BASIC_EXCLUSION_2026, m.ANNUAL_GIFT_EXCLUSION_2026],
};

// slugs whose engine is not calc.mjs
const MODULE = { 'merchant-of-record-fee-calculator': 'engine.mjs' };

for (const [slug, figures] of Object.entries(PILOTS)) {
  test(`${slug}: lead is sourced, dated and matches the calc module`, async () => {
    const html = readFileSync(new URL(`${slug}/index.html`, root), 'utf8');
    const m = html.match(/<p[^>]*data-answer-lead[^>]*>([\s\S]*?)<\/p>/);
    assert.ok(m, 'no data-answer-lead paragraph');
    const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.match(text, /Source:/);
    assert.match(text, /(?:verified|as of) \d{4}-\d{2}(?:-\d{2})?/i);
    const allowed = (await figures(await import(new URL(`${slug}/${MODULE[slug] || 'calc.mjs'}`, root)))).map(Number);
    const stated = [...text.matchAll(/\$([\d,]+(?:\.\d+)?)/g)].map((x) => Number(x[1].replace(/,/g, '')));
    assert.ok(stated.length > 0, 'lead states no figure');
    for (const n of stated) assert.ok(allowed.includes(n), `$${n} is not a figure exported by ${slug}/calc.mjs`);
  });
}

// Statutory-timing lead (no dollar figures): the stages it names must be the
// ones the planner's calc module models, and it must cite the rule and a date.
test('patent-maintenance-fee-planner: lead is sourced, dated and matches the modelled stages', async () => {
  const slug = 'patent-maintenance-fee-planner';
  const html = readFileSync(new URL(`${slug}/index.html`, root), 'utf8');
  const m = html.match(/<p[^>]*data-answer-lead[^>]*>([\s\S]*?)<\/p>/);
  assert.ok(m, 'no data-answer-lead paragraph');
  const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(text, /Source:/);
  assert.match(text, /as of \d{4}-\d{2}-\d{2}/i);
  const { STAGES } = await import(new URL(`${slug}/calc.mjs`, root));
  for (const s of STAGES) {
    assert.ok(text.includes(s.label.replace('-year', '')) || text.includes(s.label), `lead omits the ${s.label} stage`);
    assert.equal(s.dueMonths - s.openMonths, 6);
    assert.equal(s.graceMonths - s.dueMonths, 6);
  }
});

// TFSA lead: the stated 2026 limit must be the one the checker's table holds, and the 1% rate its text names.
test('tfsa-over-contribution-checker: lead is sourced, dated and matches the limits table', async () => {
  const slug = 'tfsa-over-contribution-checker';
  const html = readFileSync(new URL(`${slug}/index.html`, root), 'utf8');
  const m = html.match(/<p[^>]*data-answer-lead[^>]*>([\s\S]*?)<\/p>/);
  assert.ok(m, 'no data-answer-lead paragraph');
  const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(text, /Source:/);
  assert.match(text, /as of \d{4}-\d{2}-\d{2}/i);
  const { LIMITS } = await import(new URL(`${slug}/calc.mjs`, root));
  const stated = [...text.matchAll(/\$([\d,]+)/g)].map((x) => Number(x[1].replace(/,/g, '')));
  assert.deepEqual(stated, [LIMITS[2026]]);
  assert.match(text, /1%/);
});

// Overtime lead (no dollar figures): the 40-hour threshold and 1.5x multiplier it states must be the calculator's defaults.
test('overtime-pay-calculator: lead is sourced, dated and matches the calculator defaults', async () => {
  const slug = 'overtime-pay-calculator';
  const html = readFileSync(new URL(`${slug}/index.html`, root), 'utf8');
  const m = html.match(/<p[^>]*data-answer-lead[^>]*>([\s\S]*?)<\/p>/);
  assert.ok(m, 'no data-answer-lead paragraph');
  const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(text, /Source:/);
  assert.match(text, /as of \d{4}-\d{2}-\d{2}/i);
  const { computeSingleRateOvertime } = await import(new URL(`${slug}/calc.mjs`, root));
  const r = computeSingleRateOvertime({ hourlyRate: 10, hoursWorked: 41 });
  assert.match(text, /one and one-half times/);
  assert.match(text, /over 40 in a workweek/);
  assert.equal(r.overtimeRate ?? r.summary?.overtimeRate, 15);
});

// Solo 401(k) lead: every dollar figure and the 20% rate it states must be the calculator's own constants.
test('solo-401k-contribution-calculator: lead is sourced, dated and matches the limits', async () => {
  const slug = 'solo-401k-contribution-calculator';
  const html = readFileSync(new URL(`${slug}/index.html`, root), 'utf8');
  const m = html.match(/<p[^>]*data-answer-lead[^>]*>([\s\S]*?)<\/p>/);
  assert.ok(m, 'no data-answer-lead paragraph');
  const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(text, /Source:/);
  assert.match(text, /as of \d{4}-\d{2}-\d{2}/i);
  const { LIMITS_2026: L, EMPLOYER_CONTRIBUTION_RATE } = await import(new URL(`${slug}/calc.mjs`, root));
  const stated = [...text.matchAll(/\$([\d,]+)/g)].map((x) => Number(x[1].replace(/,/g, '')));
  assert.deepEqual(stated, [L.employeeDeferral, L.catchUp50, L.catchUp60to63, L.annualAdditions]);
  assert.match(text, new RegExp(`${EMPLOYER_CONTRIBUTION_RATE * 100}%`));
});

// Inherited-IRA lead (no dollar figures): the 10-year window and the excise-tax rates it states must be what the planner models.
test('inherited-ira-10-year-withdrawal-planner: lead is sourced, dated and matches the planner', async () => {
  const slug = 'inherited-ira-10-year-withdrawal-planner';
  const html = readFileSync(new URL(`${slug}/index.html`, root), 'utf8');
  const m = html.match(/<p[^>]*data-answer-lead[^>]*>([\s\S]*?)<\/p>/);
  assert.ok(m, 'no data-answer-lead paragraph');
  const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(text, /Source:/);
  assert.match(text, /as of \d{4}-\d{2}-\d{2}/i);
  const { normalize } = await import(new URL(`${slug}/calc.mjs`, root));
  assert.equal(normalize({ years: 99 }).years, 10, 'planner caps the window at 10 years');
  assert.match(text, /10th year/);
  assert.match(text, /25% excise tax \(10% if corrected within two years\)/);
  assert.ok(html.includes('25% excise tax on the amount you should have taken, reduced to 10%'));
});

// UK VAT registration lead: the pound threshold it states must be the checker's own, and the 30-day rule it names must be the one modelled.
test('uk-vat-registration-checker: lead is sourced, dated and matches the threshold', async () => {
  const slug = 'uk-vat-registration-checker';
  const html = readFileSync(new URL(`${slug}/index.html`, root), 'utf8');
  const m = html.match(/<p[^>]*data-answer-lead[^>]*>([\s\S]*?)<\/p>/);
  assert.ok(m, 'no data-answer-lead paragraph');
  const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(text, /Source:/);
  assert.match(text, /as of \d{4}-\d{2}-\d{2}/i);
  const { R } = await import(new URL(`${slug}/calc.mjs`, root));
  const stated = [...text.matchAll(/£([\d,]+)/g)].map((x) => Number(x[1].replace(/,/g, '')));
  assert.ok(stated.length > 0);
  for (const n of stated) assert.equal(n, R.registerThreshold);
  assert.match(text, /30 days/);
});

// ACA cliff lead: the 400% cliff dollar amounts, the top and bottom applicable percentages it states must be the calculator's own.
test('aca-subsidy-cliff-calculator: lead is sourced, dated and matches the calculator', async () => {
  const slug = 'aca-subsidy-cliff-calculator';
  const html = readFileSync(new URL(`${slug}/index.html`, root), 'utf8');
  const m = html.match(/<p[^>]*data-answer-lead[^>]*>([\s\S]*?)<\/p>/);
  assert.ok(m, 'no data-answer-lead paragraph');
  const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(text, /Source:/);
  assert.match(text, /as of \d{4}-\d{2}-\d{2}/i);
  const { fplAmount, BANDS } = await import(new URL(`${slug}/calc.mjs`, root));
  const stated = [...text.matchAll(/\$([\d,]+)/g)].map((x) => Number(x[1].replace(/,/g, '')));
  assert.deepEqual(stated, [fplAmount(1) * 4, fplAmount(2) * 4]);
  assert.match(text, new RegExp(`${BANDS[0][1].toFixed(2)}%`));
  assert.match(text, new RegExp(`${BANDS[BANDS.length - 1][2].toFixed(2)}%`));
});

// TikTok Shop lead (percentages only): the rates it states must be the ones the presets hold.
test('tiktok-shop-fee-calculator: lead is sourced, dated and matches the fee presets', async () => {
  const slug = 'tiktok-shop-fee-calculator';
  const html = readFileSync(new URL(`${slug}/index.html`, root), 'utf8');
  const m = html.match(/<p[^>]*data-answer-lead[^>]*>([\s\S]*?)<\/p>/);
  assert.ok(m, 'no data-answer-lead paragraph');
  const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(text, /Source:/);
  assert.match(text, /as of \d{4}-\d{2}-\d{2}/i);
  const { FEE_SCHEDULE_PRESETS: P } = await import(new URL(`${slug}/calc.mjs`, root));
  const stated = [...text.matchAll(/(\d+(?:\.\d+)?)%/g)].map((x) => Number(x[1]));
  assert.deepEqual(stated, [P.us_standard.referralRate, P.oct_2026.referralRate, P.oct_2026.facilitationRate]);
});

// 401(k) plan fee lead (no dollar figures): it must state the no-safe-harbor rule the calculator's own header says, and cite ERISA 404(a) and 408(b)(2).
test('401k-plan-fee-calculator: lead is sourced, dated and matches the calculator header', async () => {
  const slug = '401k-plan-fee-calculator';
  const html = readFileSync(new URL(`${slug}/index.html`, root), 'utf8');
  const m = html.match(/<p[^>]*data-answer-lead[^>]*>([\s\S]*?)<\/p>/);
  assert.ok(m, 'no data-answer-lead paragraph');
  const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(text, /Source:/);
  assert.match(text, /as of \d{4}-\d{2}-\d{2}/i);
  assert.match(text, /No law sets a maximum/);
  assert.match(text, /408\(b\)\(2\)/);
  assert.equal([...text.matchAll(/\$[\d,]+/g)].length, 0, 'lead should state no dollar figure');
  const calc = readFileSync(new URL(`${slug}/calc.mjs`, root), 'utf8');
  assert.match(calc, /no legal safe-harbor percentage/);
});
