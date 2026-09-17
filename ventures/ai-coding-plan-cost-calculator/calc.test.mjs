import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compare,
  dailyApiCostUsd,
  formatUsd,
  MODEL_PRESETS,
  PLAN_MODEL_DEFAULT,
  PLAN_PRESETS,
  USAGE_TIERS,
} from './calc.mjs';

test('dailyApiCostUsd sums the four token categories at their own rate', () => {
  const usage = { inputTokens: 1e6, outputTokens: 1e6, cacheWriteTokens: 1e6, cacheReadTokens: 1e6 };
  const rates = { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 };
  assert.equal(dailyApiCostUsd(usage, rates), 3 + 15 + 3.75 + 0.3);
});

test('dailyApiCostUsd is zero for zero usage regardless of rates', () => {
  const zero = { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 };
  assert.equal(dailyApiCostUsd(zero, MODEL_PRESETS['claude-opus']), 0);
});

test('compare: subscription wins when API-equivalent cost is higher', () => {
  const result = compare({
    planMonthlyUsd: 20,
    usage: USAGE_TIERS.heavy,
    rates: MODEL_PRESETS['claude-sonnet'],
    activeDaysPerMonth: 21,
  });
  assert.equal(result.subscriptionMonthlyUsd, 20);
  assert.ok(result.apiMonthlyUsd > 20, 'heavy usage at Sonnet rates should price well above a $20 plan');
  assert.equal(result.cheaper, 'subscription');
  assert.ok(result.deltaUsd > 0);
  assert.ok(result.breakEvenUsageScale < 1, 'break-even scale should be under 1 when the plan already wins');
});

test('compare: API wins when usage is light enough', () => {
  const result = compare({
    planMonthlyUsd: 200,
    usage: USAGE_TIERS.light,
    rates: MODEL_PRESETS['claude-haiku'],
    activeDaysPerMonth: 5,
  });
  assert.equal(result.cheaper, 'api');
  assert.ok(result.deltaUsd < 0);
  assert.ok(result.breakEvenUsageScale > 1);
});

test('compare: seats multiply the subscription cost, not the usage', () => {
  const single = compare({ planMonthlyUsd: 19, seats: 1, usage: USAGE_TIERS.typical, rates: MODEL_PRESETS['claude-sonnet'] });
  const team = compare({ planMonthlyUsd: 19, seats: 5, usage: USAGE_TIERS.typical, rates: MODEL_PRESETS['claude-sonnet'] });
  assert.equal(team.subscriptionMonthlyUsd, single.subscriptionMonthlyUsd * 5);
  assert.equal(team.apiMonthlyUsd, single.apiMonthlyUsd);
});

test('compare: exact equality reports a tie', () => {
  const rates = { input: 1, output: 0, cacheWrite: 0, cacheRead: 0 };
  const usage = { inputTokens: 1_000_000, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 };
  // 1 active day * $1/day = $1/mo API cost; set the plan to match exactly.
  const result = compare({ planMonthlyUsd: 1, usage, rates, activeDaysPerMonth: 1 });
  assert.equal(result.cheaper, 'tie');
  assert.equal(result.deltaUsd, 0);
  assert.equal(result.breakEvenUsageScale, 1);
});

test('compare: zero API cost has a null break-even scale, not Infinity or NaN, and API reads as cheaper', () => {
  const zero = { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 };
  const result = compare({ planMonthlyUsd: 20, usage: zero, rates: MODEL_PRESETS['claude-opus'] });
  assert.equal(result.apiMonthlyUsd, 0);
  assert.equal(result.breakEvenUsageScale, null);
  // Zero usage genuinely costs zero on the API side, so it is correctly the
  // cheaper of the two options -- not a case the calculator should mask.
  assert.equal(result.cheaper, 'api');
});

test('compare: activeDaysPerMonth of 0 means no API spend at all, so API reads as cheaper', () => {
  const result = compare({ planMonthlyUsd: 20, usage: USAGE_TIERS.heavy, rates: MODEL_PRESETS['claude-opus'], activeDaysPerMonth: 0 });
  assert.equal(result.apiMonthlyUsd, 0);
  assert.equal(result.cheaper, 'api');
});

test('compare rejects negative or non-finite inputs rather than silently computing garbage', () => {
  const usage = USAGE_TIERS.typical;
  const rates = MODEL_PRESETS['claude-sonnet'];
  assert.throws(() => compare({ planMonthlyUsd: -1, usage, rates }), RangeError);
  assert.throws(() => compare({ planMonthlyUsd: 20, seats: 0, usage, rates }), RangeError);
  assert.throws(() => compare({ planMonthlyUsd: 20, usage: { ...usage, inputTokens: -5 }, rates }), RangeError);
  assert.throws(() => compare({ planMonthlyUsd: 20, usage, rates: { ...rates, output: NaN } }), RangeError);
  assert.throws(() => compare({ planMonthlyUsd: 20, usage, rates, activeDaysPerMonth: -1 }), RangeError);
});

test('every model preset has all four rate fields and a label', () => {
  for (const [key, preset] of Object.entries(MODEL_PRESETS)) {
    assert.ok(preset.label, `${key} needs a label`);
    for (const field of ['input', 'output', 'cacheWrite', 'cacheRead']) {
      assert.equal(typeof preset[field], 'number', `${key}.${field}`);
    }
  }
});

test('openai-gpt and gemini presets exist so a ChatGPT Plus, Copilot, or Cursor visitor gets a matching API, not silently only Claude rates', () => {
  assert.ok(MODEL_PRESETS['openai-gpt'], 'missing openai-gpt preset');
  assert.ok(MODEL_PRESETS.gemini, 'missing gemini preset');
});

test('openai-gpt and gemini bill no cache-write rate, unlike the Claude presets, because neither vendor charges to populate its automatic prompt cache', () => {
  assert.equal(MODEL_PRESETS['openai-gpt'].cacheWrite, 0);
  assert.equal(MODEL_PRESETS.gemini.cacheWrite, 0);
  for (const key of ['claude-opus', 'claude-sonnet', 'claude-haiku']) {
    assert.ok(MODEL_PRESETS[key].cacheWrite > 0, `${key} should carry a nonzero cache-write premium`);
  }
});

test('every model preset\'s cache-read rate is cheaper than its fresh-input rate, or both are zero', () => {
  for (const [key, preset] of Object.entries(MODEL_PRESETS)) {
    if (preset.input === 0) continue;
    assert.ok(preset.cacheRead <= preset.input, `${key}: cache reads should not cost more than fresh input`);
  }
});

test('every PLAN_PRESETS key has a PLAN_MODEL_DEFAULT entry naming a real model preset', () => {
  for (const planKey of Object.keys(PLAN_PRESETS)) {
    const modelKey = PLAN_MODEL_DEFAULT[planKey];
    assert.ok(modelKey, `${planKey} has no PLAN_MODEL_DEFAULT entry`);
    assert.ok(MODEL_PRESETS[modelKey], `${planKey} maps to unknown model preset "${modelKey}"`);
  }
});

test('the OpenAI-backed plans (ChatGPT Plus, both Copilot tiers) default to the openai-gpt preset, not a Claude rate', () => {
  for (const planKey of ['chatgpt-plus', 'copilot-individual', 'copilot-business']) {
    assert.equal(PLAN_MODEL_DEFAULT[planKey], 'openai-gpt', planKey);
  }
});

test('compare: a ChatGPT Plus-sized plan against openai-gpt rates prices sensibly, not against Claude rates by accident', () => {
  const result = compare({
    planMonthlyUsd: PLAN_PRESETS['chatgpt-plus'].monthlyUsd,
    usage: USAGE_TIERS.typical,
    rates: MODEL_PRESETS[PLAN_MODEL_DEFAULT['chatgpt-plus']],
  });
  assert.ok(Number.isFinite(result.apiMonthlyUsd));
  assert.ok(result.apiMonthlyUsd > 0);
});

test('every plan preset has a label and a non-negative monthly price', () => {
  for (const [key, preset] of Object.entries(PLAN_PRESETS)) {
    assert.ok(preset.label, `${key} needs a label`);
    assert.equal(typeof preset.monthlyUsd, 'number', `${key}.monthlyUsd`);
    assert.ok(preset.monthlyUsd >= 0, `${key}.monthlyUsd must be non-negative`);
  }
});

test('every usage tier has all four token fields and a label', () => {
  for (const [key, tier] of Object.entries(USAGE_TIERS)) {
    assert.ok(tier.label, `${key} needs a label`);
    for (const field of ['inputTokens', 'outputTokens', 'cacheWriteTokens', 'cacheReadTokens']) {
      assert.equal(typeof tier[field], 'number', `${key}.${field}`);
    }
  }
});

test('formatUsd renders whole dollars for large amounts and cents for small ones', () => {
  assert.equal(formatUsd(200), '$200');
  assert.equal(formatUsd(0), '$0');
  assert.equal(formatUsd(-45), '-$45');
  assert.equal(formatUsd(3.5), '$3.50');
});

/** Dollar amounts compared to the nearest hundredth of a cent. The overflow
 * arithmetic divides by the month's token total and multiplies back through
 * a blended rate, so exact equality against a round number would be an
 * assertion about IEEE 754 rather than about the price. A tenth of a cent is
 * far below anything the page renders (`formatUsd` shows at most cents).
 */
function assertUsd(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) < 1e-4,
    message
      ? `${message} (got ${actual}, expected ~${expected})`
      : `expected ~${expected}, got ${actual}`,
  );
}

// --- Included allowance and overflow (added 2026-09-17) -------------------
//
// Until this block existed, `compare` modelled every subscription as
// unlimited. These pin the correction, and the first one pins the part that
// matters most: an absent allowance must behave exactly as it did before, so
// the fix cannot regress the visitor who has no cap to enter.

test('compare: omitting the allowance leaves every previous field unchanged', () => {
  const args = {
    planMonthlyUsd: 100,
    usage: USAGE_TIERS.typical,
    rates: MODEL_PRESETS['claude-sonnet'],
    activeDaysPerMonth: 21,
  };
  const uncapped = compare(args);
  const explicitNull = compare({ ...args, includedTokensPerMonth: null });

  assert.deepEqual(uncapped, explicitNull, 'null and omitted must be the same call');
  assert.equal(uncapped.includedTokensPerMonth, null);
  assert.equal(uncapped.overflowMonthlyUsd, 0, 'no cap means nothing overflows');
  assert.equal(uncapped.quotaCoveredFraction, 1);
  assert.equal(uncapped.quotaExhaustedOnDay, null);
  assert.equal(uncapped.beyondQuotaAdvantageUsd, null);
  // The pre-existing contract: with no cap the plan's total IS the flat fee,
  // and delta is still API minus that fee.
  assert.equal(uncapped.planTotalMonthlyUsd, uncapped.subscriptionMonthlyUsd);
  assert.equal(uncapped.deltaUsd, uncapped.apiMonthlyUsd - uncapped.subscriptionMonthlyUsd);
});

test('compare: an allowance larger than the month covers everything and costs the flat fee', () => {
  const result = compare({
    planMonthlyUsd: 100,
    usage: USAGE_TIERS.typical,
    rates: MODEL_PRESETS['claude-sonnet'],
    activeDaysPerMonth: 21,
    includedTokensPerMonth: 1e12,
  });
  assert.equal(result.quotaCoveredFraction, 1);
  assert.equal(result.overflowTokens, 0);
  assert.equal(result.overflowMonthlyUsd, 0);
  assert.equal(result.planTotalMonthlyUsd, 100);
  assert.equal(result.quotaExhaustedOnDay, null, 'a month that never runs out has no exhaustion day');
});

test('compare: overflow is billed at API rates and named to the day it starts', () => {
  // 1M tokens a day, 10 active days = 10M tokens; the allowance covers 6M.
  const usage = {
    inputTokens: 1e6,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
  };
  const result = compare({
    planMonthlyUsd: 20,
    usage,
    rates: { input: 10, output: 0, cacheWrite: 0, cacheRead: 0 },
    activeDaysPerMonth: 10,
    includedTokensPerMonth: 6e6,
  });

  assert.equal(result.monthlyTokens, 10e6);
  assert.equal(result.apiMonthlyUsd, 100, '10M tokens at $10/M');
  assert.equal(result.quotaCoveredFraction, 0.6);
  assert.equal(result.overflowTokens, 4e6);
  assert.equal(result.overflowMonthlyUsd, 40, '4M overflow tokens at $10/M');
  assert.equal(result.planTotalMonthlyUsd, 60, '$20 fee + $40 overflow');
  assert.equal(result.deltaUsd, 40, '$100 all-API minus $60 all-in plan');
  assert.equal(result.cheaper, 'subscription');
  // Six days of allowance are consumed by the end of day 6, so day 7 is the
  // first one billed.
  assert.equal(result.quotaExhaustedOnDay, 7);
});

test('compare: a cap can flip the verdict the unlimited model got wrong', () => {
  // The exact bias this feature corrects: heavy usage against a cheap plan
  // reads as a clear subscription win while the plan is assumed unlimited,
  // and reverses once a realistic allowance is modelled.
  const args = {
    planMonthlyUsd: 20,
    usage: USAGE_TIERS.heavy,
    rates: MODEL_PRESETS['claude-opus'],
    activeDaysPerMonth: 21,
  };
  const unlimited = compare(args);
  assert.equal(unlimited.cheaper, 'subscription');

  // An allowance covering a tiny slice of that month.
  const capped = compare({ ...args, includedTokensPerMonth: unlimited.monthlyTokens * 0.01 });
  assert.ok(
    capped.planTotalMonthlyUsd > unlimited.planTotalMonthlyUsd,
    'modelling a cap can only raise the plan-side cost, never lower it',
  );
  assert.ok(capped.overflowMonthlyUsd > 0);
  assert.equal(capped.quotaExhaustedOnDay, 1, 'a 1% allowance is gone on the first day');
});

test('compare: past the allowance there is no break-even, only a constant gap', () => {
  // The fee has to be dear enough that the uncapped crossing (P/A = 0.8 of
  // this usage) would land above the 60%-of-the-month allowance. At $20 it
  // would not, and the crossing is real and reportable -- see the test below.
  const base = {
    planMonthlyUsd: 80,
    usage: { inputTokens: 1e6, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 },
    rates: { input: 10, output: 0, cacheWrite: 0, cacheRead: 0 },
    activeDaysPerMonth: 10,
    includedTokensPerMonth: 6e6,
  };
  const result = compare(base);

  assert.equal(
    result.breakEvenUsageScale,
    null,
    'the uncapped crossing lies above the cap, so reporting it would name a crossing that does not exist',
  );
  // 6M tokens at the blended $10/M is $60 of allowance for an $80 fee: the
  // allowance is worth less than what it costs, so the gap settles negative.
  // Compared to a cent rather than exactly: these figures come out of a
  // divide-then-multiply through the blended rate, so binary floating point
  // lands a few ulps off a round number and an exact assertion would be
  // testing IEEE 754 rather than the pricing.
  assertUsd(result.beyondQuotaAdvantageUsd, -20);

  // And the claim the copy makes: doubling usage past the cap moves both
  // columns by the same amount, so the gap does not budge.
  const doubled = compare({
    ...base,
    usage: { inputTokens: 2e6, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 },
  });
  assertUsd(doubled.deltaUsd, result.deltaUsd, 'the gap is constant beyond the allowance');
  assertUsd(doubled.beyondQuotaAdvantageUsd, result.beyondQuotaAdvantageUsd);
});

test('compare: a crossing that falls below the cap is still reported', () => {
  // Light usage against a cap it never approaches: the cap is irrelevant to
  // the comparison, so the usual break-even scale must survive.
  const result = compare({
    planMonthlyUsd: 20,
    usage: USAGE_TIERS.light,
    rates: MODEL_PRESETS['claude-haiku'],
    activeDaysPerMonth: 21,
    includedTokensPerMonth: 1e12,
  });
  assert.ok(result.breakEvenUsageScale !== null, 'a reachable crossing must still be named');
  assert.equal(
    result.breakEvenUsageScale,
    result.subscriptionMonthlyUsd / result.apiMonthlyUsd,
  );
});

test('compare: an allowance of zero is not the same as no allowance', () => {
  const args = {
    planMonthlyUsd: 20,
    usage: USAGE_TIERS.typical,
    rates: MODEL_PRESETS['claude-sonnet'],
    activeDaysPerMonth: 21,
  };
  const none = compare(args);
  const zero = compare({ ...args, includedTokensPerMonth: 0 });

  assert.equal(none.overflowMonthlyUsd, 0);
  assert.equal(zero.quotaCoveredFraction, 0, 'a zero allowance covers nothing');
  assert.equal(zero.overflowMonthlyUsd, zero.apiMonthlyUsd, 'so every token is overflow');
  assert.equal(zero.planTotalMonthlyUsd, 20 + zero.apiMonthlyUsd);
  assert.equal(zero.quotaExhaustedOnDay, 1);
});

test('compare: rejects a negative or non-finite allowance, and accepts null', () => {
  const args = {
    planMonthlyUsd: 20,
    usage: USAGE_TIERS.typical,
    rates: MODEL_PRESETS['claude-sonnet'],
  };
  assert.throws(() => compare({ ...args, includedTokensPerMonth: -1 }), RangeError);
  assert.throws(() => compare({ ...args, includedTokensPerMonth: Number.NaN }), RangeError);
  assert.throws(() => compare({ ...args, includedTokensPerMonth: Infinity }), RangeError);
  assert.doesNotThrow(() => compare({ ...args, includedTokensPerMonth: null }));
});

test('compare: zero usage with a cap does not divide by zero', () => {
  const result = compare({
    planMonthlyUsd: 20,
    usage: USAGE_TIERS.custom,
    rates: MODEL_PRESETS['claude-sonnet'],
    activeDaysPerMonth: 21,
    includedTokensPerMonth: 1e6,
  });
  assert.equal(result.monthlyTokens, 0);
  assert.equal(result.quotaCoveredFraction, 1);
  assert.equal(result.overflowMonthlyUsd, 0);
  assert.equal(result.quotaExhaustedOnDay, null);
  assert.equal(result.beyondQuotaAdvantageUsd, null);
  assert.ok(Number.isFinite(result.planTotalMonthlyUsd));
});

test('no plan preset ships an invented token allowance', () => {
  // The honesty rule this feature is built on: vendors publish coding-plan
  // limits in messages, "premium requests" or rolling windows, never in
  // tokens, so there is no sourced figure to default. If a preset ever
  // grows one, it needs a citation and this test should be the thing that
  // makes someone go and find it.
  for (const [key, preset] of Object.entries(PLAN_PRESETS)) {
    assert.equal(
      preset.includedTokensPerMonth,
      undefined,
      `${key} must not ship a token allowance without a published source`,
    );
  }
});

test('compare: a break-even below the cap and the constant gap can coexist', () => {
  // The other half of the pair above, and the reason the copy reports both:
  // a cheap plan crosses the API line while still inside its allowance, AND
  // settles to a constant advantage once usage runs past it. Both facts are
  // true of the same result, and the second is not a replacement for the
  // first.
  const result = compare({
    planMonthlyUsd: 20,
    usage: { inputTokens: 1e6, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 },
    rates: { input: 10, output: 0, cacheWrite: 0, cacheRead: 0 },
    activeDaysPerMonth: 10,
    includedTokensPerMonth: 6e6,
  });
  assert.equal(result.breakEvenUsageScale, 0.2, '$20 of a $100 month, and 2M tokens is inside the 6M cap');
  assertUsd(result.beyondQuotaAdvantageUsd, 40, '$60 of allowance for a $20 fee');
});

test('a positive beyond-quota advantage always comes with a reachable crossing', () => {
  // Worth pinning because it decides what the page may say. The gap beyond
  // the cap is A*C/T - P, and it is positive exactly when P/A < C/T -- which
  // is the same condition that puts the crossing inside the allowance. So
  // "no crossing" and "the plan is ahead beyond the cap" cannot both hold,
  // and copy offering that combination would be describing nothing.
  for (const planMonthlyUsd of [0, 5, 20, 59.9, 60, 60.1, 80, 500]) {
    const result = compare({
      planMonthlyUsd,
      usage: { inputTokens: 1e6, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 },
      rates: { input: 10, output: 0, cacheWrite: 0, cacheRead: 0 },
      activeDaysPerMonth: 10,
      includedTokensPerMonth: 6e6,
    });
    if (result.beyondQuotaAdvantageUsd > 0) {
      assert.ok(
        result.breakEvenUsageScale !== null,
        `plan $${planMonthlyUsd}: a positive beyond-cap gap must come with a crossing`,
      );
    }
  }
});
