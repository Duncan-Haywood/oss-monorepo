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
import { catalog, PLANS } from "./plans.mjs";
import { PLANS as SITE_PLANS } from "../../einvoice-site/content/pricing.mjs";

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
  assert.doesNotThrow(() => assertPricingBand(catalog.plans, costAtFullAllowance));
  const checks = checkPricingBand(catalog.plans, costAtFullAllowance);
  assert.equal(checks.length, 3, "Firm S, M and L, monthly");
  for (const c of checks) assert.ok(c.markup >= MIN_MARKUP, `${c.planKey}/${c.interval}: markup ${c.markup.toFixed(2)}`);
});

test("plans: trial is free and not sold; paid plans grow every limit", () => {
  assert.equal(PLANS.trial.purchasable, false);
  assert.equal(PLANS.trial.priceCents, 0);
  assert.deepEqual(catalog.purchasableKeys, ["starter", "standard", "plus"]);
  for (const k of ["documentsPerMonth", "clients", "apiKeys"]) {
    assert.ok(PLANS.trial[k] < PLANS.starter[k] && PLANS.starter[k] < PLANS.standard[k] && PLANS.standard[k] < PLANS.plus[k], k);
  }
});

test("paid plans are exactly the tiers the marketing site publishes (apps/einvoice-site/content/pricing.mjs)", () => {
  assert.deepEqual(
    catalog.purchasable.map((p) => ({ key: p.key, priceCents: p.priceCents, clients: p.clients, invoices: p.documentsPerMonth, explanations: p.llmExplanationsPerMonth, name: p.name })),
    SITE_PLANS.map((p) => ({ key: p.key, priceCents: p.priceCents, clients: p.clients, invoices: p.invoices, explanations: p.explanations, name: p.name.en })),
  );
  for (const p of catalog.purchasable) assert.equal(p.annualPriceCents, null, "the site sells monthly only");
});

test("billing/paddle-catalog.json matches plans.mjs (run `node pro/paddle-catalog.mjs --write`)", () => {
  assert.equal(readFileSync(CATALOG_FILE, "utf8"), catalogJson());
});
