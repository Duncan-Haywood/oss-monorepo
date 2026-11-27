// Prices against cost (packages/billing's 40% margin floor) and the committed Paddle catalog.
// Proprietary (see ../LICENSE, part 2).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  assertPricingBand,
  CLOUDFLARE_HOSTING,
  checkPricingBand,
  fullMonthlyCost,
  hostingMicros,
  llmCostMicros,
  MIN_MARKUP,
  tokens,
} from "../../../packages/billing/src/index.ts";
import { DEFAULT_MODEL } from "./llm.mjs";
import { CATALOG_FILE, catalogJson } from "./paddle-catalog.mjs";
import { catalog, METER_RATES, meterStatement, PLANS } from "./plans.mjs";
import { API_METER, PLANS as SITE_PLANS } from "../../einvoice-site/content/pricing.mjs";

const TIERS = catalog.plans.filter((p) => !p.metered);
const tiersPurchasable = TIERS.filter((p) => p.purchasable);

// Cost assumptions, worst case (docs/BILLING.md, "Prices and margin"). Prices are euro cents and
// costs are US-dollar micros; comparing them one to one undercounts revenue (a euro is worth more
// than a dollar), so the check is conservative.
// - One document: measured 1.1 ms CPU for check + explain + fix + re-validate on the examples
//   (2026-11-26, Node 22, no Schematron). Budgeted at $0.001, about 100x that, to cover the official
//   Schematron when installed, storage of run history and request overhead on any host.
// - One model explanation: the prompt is capped by explain.mjs (maxTokens 1500 out); budgeted at
//   3,000 tokens in and the full 1,500 out on the configured default model, no cache discount.
const HOSTING = { ...CLOUDFLARE_HOSTING, perUnitMicros: 1000 };
const perExplanation = llmCostMicros(tokens(3000, 1500), DEFAULT_MODEL);
const costAtFullAllowance = (plan, charge) =>
  fullMonthlyCost(
    { variableMicros: plan.llmExplanationsPerMonth * perExplanation, hostingMicros: hostingMicros(plan.documentsPerMonth, HOSTING) },
    charge,
  ).totalMicros;

test("every paid plan keeps at least a 40% margin at full allowance", () => {
  assert.doesNotThrow(() => assertPricingBand(TIERS, costAtFullAllowance));
  const checks = checkPricingBand(TIERS, costAtFullAllowance);
  assert.equal(checks.length, 3, "Firm S, M and L, monthly");
  for (const c of checks) assert.ok(c.markup >= MIN_MARKUP, `${c.planKey}/${c.interval}: markup ${c.markup.toFixed(2)}`);
});

test("plans: trial is free and not sold; paid plans grow every limit", () => {
  assert.equal(PLANS.trial.purchasable, false);
  assert.equal(PLANS.trial.priceCents, 0);
  assert.deepEqual(catalog.purchasableKeys, ["starter", "standard", "plus", "api"]);
  for (const k of ["documentsPerMonth", "clients", "apiKeys"]) {
    assert.ok(PLANS.trial[k] < PLANS.starter[k] && PLANS.starter[k] < PLANS.standard[k] && PLANS.standard[k] < PLANS.plus[k], k);
  }
});

test("paid plans are exactly the tiers the marketing site publishes (apps/einvoice-site/content/pricing.mjs)", () => {
  assert.deepEqual(
    tiersPurchasable.map((p) => ({ key: p.key, priceCents: p.priceCents, clients: p.clients, invoices: p.documentsPerMonth, explanations: p.llmExplanationsPerMonth, name: p.name })),
    SITE_PLANS.map((p) => ({ key: p.key, priceCents: p.priceCents, clients: p.clients, invoices: p.invoices, explanations: p.explanations, name: p.name.en })),
  );
  for (const p of catalog.purchasable) assert.equal(p.annualPriceCents, null, "the site sells monthly only");
});

test("the metered API plan charges exactly the site's API_METER rates, its minimum as the price", () => {
  assert.deepEqual(
    { validationCents: METER_RATES.validationCents, explanationCents: METER_RATES.explainedCents, minimumCents: METER_RATES.minimumCents },
    API_METER,
  );
  assert.equal(PLANS.api.metered, true);
  assert.equal(PLANS.api.priceCents, API_METER.minimumCents);
  assert.equal(catalog.plans.filter((p) => p.metered).length, 1);
});

test("meterStatement: errors at the explained rate, the rest at the validation rate, minimum credited", () => {
  const z = meterStatement({ period: "2026-11", documents: 0, errorDocuments: 0 });
  assert.deepEqual([z.usageCents, z.overageCents, z.totalCents], [0, 0, 1900]);
  // 10,000 invoices, 300 with errors: 9,700 x 0.14 = 1,358 + 300 x 4 = 1,200 -> 2,558; 658 above the minimum
  const m = meterStatement({ period: "2026-11", documents: 10000, errorDocuments: 300 });
  assert.deepEqual(
    { validations: m.validations, explained: m.explained, validationCents: m.validationCents, explainedCents: m.explainedCents, usageCents: m.usageCents, overageCents: m.overageCents, totalCents: m.totalCents },
    { validations: 9700, explained: 300, validationCents: 1358, explainedCents: 1200, usageCents: 2558, overageCents: 658, totalCents: 2558 },
  );
  // fractions of a cent round up once on the month, never per invoice
  assert.equal(meterStatement({ period: "p", documents: 3 }).validationCents, 1, "3 x 0.14 = 0.42 -> 1");
  assert.equal(meterStatement({ period: "p", documents: 1000 }).validationCents, 140, "no float drift");
  assert.equal(meterStatement({ period: "p", documents: 5, errorDocuments: 9 }).explained, 5, "never more than documents");
});

// The metered plan's margin. Its revenue grows with use, so the check is per unit at the volume the
// minimum buys (fixed costs spread over it, as the site's PRICING.md does) and at the safety caps.
// Cost per validated invoice: the Worker host measured 40-440 ms CPU per invoice with the official
// rules (ROADMAP Done, eval/worker-parity-2026-11-26.md). At Workers Paid list prices ($0.02 per
// million CPU-ms, $0.30 per million requests; D1 $1 per million rows written, about 3 rows a check)
// 440 ms is about $0.0000127; budgeted at $0.0001, about 8x that. The tier plans above keep their
// $0.001 budget; at $0.001 the validation-only unit (€0.0014) would sit under the 40% floor, so
// re-measure before moving the metered plan to a host that costs that much.
test("the metered API plan keeps at least a 40% margin per unit, at the minimum and at the caps", () => {
  const perDocMicros = 100;
  const usdMicrosPerCent = 10_000; // euro cents compared one to one with dollar cents (conservative, as above)
  const feeShare = 0.05 + 0.03; // Paddle 5% + 3% refund reserve
  const fixedMicros = 50 * usdMicrosPerCent + hostingMicros(0, HOSTING); // Paddle's 50c per charge + hosting base share
  const margin = (revenueCents, costMicros) => 1 - (costMicros + revenueCents * usdMicrosPerCent * feeShare) / (revenueCents * usdMicrosPerCent);
  for (const [label, docs, errors] of [
    ["minimum, all valid", Math.floor(1900 / 0.14), 0],
    ["minimum, all explained", 1900 / 4, 1900 / 4],
    ["caps, all valid", PLANS.api.documentsPerMonth, 0],
    ["caps, explained cap", PLANS.api.documentsPerMonth, PLANS.api.llmExplanationsPerMonth],
  ]) {
    const st = meterStatement({ period: "p", documents: docs, errorDocuments: errors });
    const cost = docs * perDocMicros + errors * perExplanation + fixedMicros;
    const m = margin(st.totalCents, cost);
    assert.ok(m >= 0.4, `${label}: margin ${(m * 100).toFixed(1)}%`);
  }
});

test("billing/paddle-catalog.json matches plans.mjs (run `node pro/paddle-catalog.mjs --write`)", () => {
  assert.equal(readFileSync(CATALOG_FILE, "utf8"), catalogJson());
});
