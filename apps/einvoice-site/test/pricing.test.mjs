import assert from "node:assert/strict";
import { test } from "node:test";
import {
  API_METER,
  euro,
  MARKUP_BAND,
  markup,
  meterMarkup,
  PLANS,
  planCost,
} from "../content/pricing.mjs";

const [lo, hi] = MARKUP_BAND;

test("every accountant plan is cost-plus inside the band", () => {
  for (const p of PLANS) {
    const m = markup(p);
    assert.ok(m >= lo && m <= hi, `${p.key}: markup ${m.toFixed(2)} (cost ${planCost(p)}c)`);
  }
});

test("plans stay in the €19-49 range the bet proposes, ascending", () => {
  const prices = PLANS.map((p) => p.priceCents);
  assert.equal(Math.min(...prices), 1900);
  assert.equal(Math.max(...prices), 4900);
  assert.deepEqual(
    [...prices].sort((a, b) => a - b),
    prices,
  );
  for (let i = 1; i < PLANS.length; i++) {
    for (const k of ["clients", "invoices", "explanations"]) {
      assert.ok(PLANS[i][k] > PLANS[i - 1][k], `${PLANS[i].key}.${k} grows`);
    }
  }
});

test("metered API units are cost-plus inside the band", () => {
  for (const k of ["validation", "explanation"]) {
    const m = meterMarkup(k);
    assert.ok(m >= lo && m <= hi, `${k}: markup ${m.toFixed(2)}`);
  }
  assert.ok(API_METER.explanationCents > API_METER.validationCents);
});

test("euro formatting per language", () => {
  assert.equal(euro(1900, "en"), "€19");
  assert.equal(euro(1900, "de"), "19 €");
  assert.equal(euro(140, "fr"), "1,40 €");
});
