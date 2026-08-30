// Structural tests for the Basic vs Grow plan-upgrade page and the
// comparePlans table on index.html.
//
// calc.test.mjs never looks at the HTML, so it stays green if the page
// drops a column or forgets to render the advertised break-even.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const index = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const landing = readFileSync(new URL("./basic-vs-grow.html", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

test("index renders every comparePlans column the script writes", () => {
  assert.match(index, /<tbody id="planCompare">/);
  assert.match(index, /Same volume, every plan/);
  for (const header of ["Plan", "Monthly", "Fees / order", "Profit / month", "vs current"]) {
    assert.match(index, new RegExp(header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(index, /plan\.monthlyPlan/);
  assert.match(index, /plan\.perOrderFees/);
  assert.match(index, /plan\.monthlyProfit/);
  assert.match(index, /plan\.vsCurrentMonthly/);
  assert.match(index, /comparePlans/);
  assert.match(index, /plan_upgrade_compared/);
});

test("index and the Grow landing keep the liability disclaimer visible", () => {
  for (const html of [index, landing]) {
    assert.match(html, /No warranty/);
    assert.match(html, /not tax, financial, or business advice/i);
    assert.match(html, /GitHub Sponsors/);
    assert.match(html, /Best-effort hosting, no SLA/);
  }
});

test("Grow landing states the 612-order worked example the tests lock", () => {
  assert.match(landing, /612 orders\/month/);
  assert.match(landing, /upgradeBreakEvenOrders/);
  assert.match(landing, /comparePlans/);
});

test("index and sitemap point at the plan-upgrade comparison", () => {
  assert.match(index, /basic-vs-grow\.html/);
  assert.match(sitemap, /basic-vs-grow\.html/);
});

test("index surfaces compareShopPayInstallments on the order itself", () => {
  assert.match(index, /compareShopPayInstallments/);
  assert.match(index, /id="installmentCompare"/);
  assert.match(index, /id="installmentHeadline"/);
  assert.match(index, /shop_pay_installments_compared/);
  assert.match(index, /id="installmentRate"/);
  assert.match(index, /should-i-offer-shop-pay-installments\.html/);
  const table = index.match(/<table id="installmentTable">[\s\S]*?<\/table>/);
  assert.ok(table, "index.html is missing the installment comparison table");
  const columns = table[0].match(/<th\b/g).length;
  const cells = (index.match(/installment\.rows\.map[\s\S]*?<\/td><\/tr>`/) || [""])[0].match(/<t[hd]\b/g) || [];
  assert.equal(cells.length, columns, "installment row emits a different cell count than the header");
});
