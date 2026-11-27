// The site's plan copy (src/plans.mjs) must match the app's plans (apps/cmmc/src/shared/plans.ts),
// so the pricing page never advertises a name, price or feature the app does not sell.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PLAN_COPY } from "../src/plans.mjs";

const APP = new URL("../../cmmc/src/shared/plans.ts", import.meta.url);
const BILLING = new URL("../../../packages/billing/src/pricing.ts", import.meta.url);
const source = readFileSync(APP, "utf8");

/** The text of one PLAN_LIST entry, from `key: "<key>"` to the next entry's key. */
function block(key) {
  const start = source.indexOf(`key: "${key}"`);
  assert.ok(start >= 0, `plans.ts has no plan ${key}`);
  const next = source.indexOf("key: ", start + 5);
  return source.slice(start, next === -1 ? undefined : next);
}

const cents = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "_");

for (const plan of PLAN_COPY) {
  test(`plan ${plan.key} matches apps/cmmc plans.ts`, () => {
    const b = block(plan.key);
    assert.ok(b.includes(`name: "${plan.name}"`), `name ${plan.name}`);
    assert.ok(b.replace(/\s+/g, " ").includes(`"${plan.description}"`), "description");
    assert.ok(b.includes(`priceCents: ${cents(plan.priceCents)},`), `price ${plan.priceCents}`);
    assert.ok(/purchasable: true|key: "free"/.test(b), "only free or purchasable plans are public");
    const features = [...b.slice(b.indexOf("features: [")).matchAll(/^\s*"([^"]+)",?$/gm)].map(
      (m) => m[1],
    );
    assert.deepEqual(plan.features, features);
    if (plan.priceCents === 0) assert.equal(plan.annualPriceCents, null);
    else {
      assert.ok(b.includes(`annualPriceCents: annualPriceFor(${cents(plan.priceCents)})`));
      // packages/billing annualPriceFor: 12 months less ANNUAL_DISCOUNT, rounded to the dollar.
      const discount = Number(
        readFileSync(BILLING, "utf8").match(/ANNUAL_DISCOUNT = ([\d.]+)/)?.[1],
      );
      assert.equal(
        plan.annualPriceCents,
        Math.round((plan.priceCents * 12 * (1 - discount)) / 100) * 100,
      );
    }
  });
}

test("every purchasable plan in plans.ts is on the site", () => {
  const keys = [...source.matchAll(/key: "(\w+)",[\s\S]*?purchasable: (true|false)/g)]
    .filter((m) => m[2] === "true")
    .map((m) => m[1]);
  assert.deepEqual(
    keys,
    PLAN_COPY.filter((p) => p.priceCents > 0).map((p) => p.key),
  );
});
