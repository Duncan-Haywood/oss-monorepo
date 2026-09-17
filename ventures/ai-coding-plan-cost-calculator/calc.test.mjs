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
