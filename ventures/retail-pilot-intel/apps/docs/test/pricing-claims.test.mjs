// Guards the sales copy's pricing arithmetic (quality audit 2026-11-19, defect 3).
//
// The pages once said "one incremental sale per month pays back Core
// (EUR 149-249/mo)" and "~0.6 sales/month to break even": both counted the
// sale's revenue, while the ROI page's own model counts gross profit
// (AOV x margin). At the page's low end (EUR 180 AOV, 55% margin) one sale
// earns EUR 99, which covers neither Core price. These tests recompute the
// ranges the copy states from the copy's own assumptions.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const pages = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "pages");
const read = (name) => readFileSync(join(pages, name), "utf8");

// The assumptions the ROI page states (RoiPage.tsx, "Store economics").
const AOV = [180, 450];
const MARGIN = [0.55, 0.7];
const CORE = [149, 249];
const MARGIN_PLUS = [299, 449];

const profitPerSale = [AOV[0] * MARGIN[0], AOV[1] * MARGIN[1]];
const round1 = (x) => Math.round(x * 10) / 10;
// Fewest sales: cheapest tier, best sale. Most: dearest tier, worst sale.
const salesToCover = (tier) => [round1(tier[0] / profitPerSale[1]), round1(tier[1] / profitPerSale[0])];

test("gross profit per sale at the stated AOV and margin ranges", () => {
  assert.deepEqual(profitPerSale.map(Math.round), [99, 315]);
});

test("Core needs about 0.5 to 2.5 sales a month, and the pages say so", () => {
  assert.deepEqual(salesToCover(CORE), [0.5, 2.5]);
  for (const page of ["RoiPage.tsx", "BusinessPlanPage.tsx"]) {
    const text = read(page).replace(/\s+/g, " ");
    assert.match(text, /€99–€315/, `${page} states the gross profit per sale`);
    assert.match(text, /0\.5 to 2\.5/, `${page} states the Core range`);
  }
});

test("Margin+ needs about 1 to 4.5 sales a month", () => {
  assert.deepEqual(salesToCover(MARGIN_PLUS), [0.9, 4.5]);
  assert.match(read("commercial-viability/CommercialViabilityDeepDive2026Page.tsx"), /about 1 to 4\.5/);
});

test("the EUR 350 AOV example covers EUR 199 Core in 0.8 to 1.0 sales of gross profit", () => {
  const range = [round1(199 / (350 * MARGIN[1])), round1(199 / (350 * MARGIN[0]))];
  assert.deepEqual(range, [0.8, 1.0]);
  assert.match(read("BusinessPlanPage.tsx"), /0\.8–1\.0 incremental sales\/month/);
  // 199 / 350 = 0.57: the margin at which one EUR 350 sale covers Core.
  assert.equal(Math.ceil((199 / 350) * 100), 57);
});

test("+0.3 pp conversion at 50 entries a day is 1.05 sales a week", () => {
  assert.equal(Math.round(50 * 7 * 0.003 * 100) / 100, 1.05);
  assert.match(read("BusinessPlanPage.tsx"), /350 × 0\.003 = 1\.05/);
});

test("no page says one sale a month pays for a subscription at pilot AOV", () => {
  const banned = [
    /one incremental sale per month at pilot AOV/i,
    /with one incremental sale per month/i,
    /One extra sale per month pays for this/i,
    /payback in ~1 sale\./i,
    /pays for itself with 1 incremental sale/i,
    /0\.6 incremental sales\/month/i,
  ];
  const files = [
    "RoiPage.tsx",
    "BusinessPlanPage.tsx",
    "GtmPage.tsx",
    "commercial-viability/CommercialViabilityDeepDive2026Page.tsx",
    "commercial-viability/CommercialViabilityDeepAssessmentPage.tsx",
  ];
  for (const file of files) {
    const text = read(file).replace(/\s+/g, " ");
    for (const pattern of banned) {
      assert.doesNotMatch(text, pattern, `${file} repeats a revenue-based payback claim`);
    }
  }
});
