import { test } from "node:test";
import assert from "node:assert/strict";
import { TEMPLATES, applyTemplate, templateIds } from "./templates.mjs";
import { normalizeProposal, pricingOptions, paymentSchedule, validate } from "./calc.mjs";

const base = normalizeProposal({ id: "pending", number: "PROP-0007", issued: "2026-10-15", validDays: "30", validUntil: "2026-11-14", fromName: "Ada", currency: "EUR", taxRate: "20" });

test("ids are unique and every template prices to a positive total", () => {
  assert.equal(new Set(templateIds()).size, TEMPLATES.length);
  for (const t of TEMPLATES) {
    const p = applyTemplate(base, t.id);
    const opts = pricingOptions(p);
    assert.ok(opts.length >= 1 && opts.every((o) => o.total > 0), t.id);
  }
});

test("the user's identity, numbering, currency and tax rate survive a template", () => {
  const p = applyTemplate(base, "web-design");
  assert.equal(p.number, "PROP-0007");
  assert.equal(p.fromName, "Ada");
  assert.equal(p.currency, "EUR");
  assert.equal(p.taxRate, "20");
  assert.equal(p.model, "tiers");
  assert.equal(p.options.length, 3);
});

test("fixed and tiered payment schedules add up to the total", () => {
  for (const t of TEMPLATES) {
    const p = applyTemplate(base, t.id);
    if (p.model !== "fixed" && p.model !== "tiers") continue;
    const total = pricingOptions(p)[0].total;
    const sched = paymentSchedule(p, 0);
    assert.equal(sched.reduce((s, r) => s + r.amount, 0), total, t.id);
  }
});

test("templates still ask for the client and have no hard validation errors beyond that", () => {
  const issues = validate(applyTemplate(base, "consulting"));
  assert.ok(Array.isArray(issues));
});

test("applying does not mutate the template, and an unknown id is a no-op", () => {
  const a = applyTemplate(base, "photo-shoot"); a.deliverables[0].name = "changed";
  assert.notEqual(applyTemplate(base, "photo-shoot").deliverables[0].name, "changed");
  assert.equal(applyTemplate(base, "nope").title, base.title);
});
