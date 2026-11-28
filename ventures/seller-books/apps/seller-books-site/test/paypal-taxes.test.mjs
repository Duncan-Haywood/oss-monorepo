// The PayPal taxes page: its worked example is the app's own PayPal fixture, taken through the importer's
// rules, so the page and the importer cannot drift apart.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { build, fileFor } from "../build.mjs";
import { BASE_PATH, NOT_TAX_ADVICE } from "../src/content.mjs";
import {
  IRS_1099K_THRESHOLD_QUOTE,
  IRS_MARK_NON_BUSINESS_QUOTE,
  IRS_PERSONAL_PAYMENTS_QUOTE,
  PAYPAL_CHECKED_ON,
  PAYPAL_EXAMPLE,
  PAYPAL_LEFT_OUT,
  paypalLines,
} from "../src/pages.mjs";

let out;
let pages;
const base = () => join(out, BASE_PATH.slice(1));
const read = (rel) => readFileSync(join(base(), rel), "utf8");
const htmlOf = (page) => read(fileFor(page.path));
const page = () => pages.find((p) => p.path === "/paypal-taxes");
const appFile = (rel) =>
  readFileSync(new URL(`../../seller-books/${rel}`, import.meta.url), "utf8");
const quoted = (q) => q.replaceAll("'", "&#39;").replaceAll('"', "&quot;");

before(() => {
  out = mkdtempSync(join(tmpdir(), "seller-books-site-paypal-"));
  ({ pages } = build(out));
});
after(() => rmSync(out, { recursive: true, force: true }));

/** The fixture as rows of named cells (every cell is quoted; one subject holds a comma). */
function fixtureRows() {
  const [head, ...lines] = appFile("test/fixtures/paypal-activity-download.csv").trim().split("\n");
  const cells = (l) => [...l.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
  const cols = cells(head);
  return lines.map((l) => {
    const c = cells(l);
    assert.equal(c.length, cols.length, l);
    return Object.fromEntries(cols.map((k, i) => [k, c[i]]));
  });
}
const money = (v) => Math.round(Number(v || "0") * 100);

describe("the PayPal taxes page", () => {
  test("the example is the fixture's kept rows, in file order, figure for figure", () => {
    const rows = fixtureRows();
    assert.equal(rows.length, PAYPAL_EXAMPLE.length + PAYPAL_LEFT_OUT.length);
    // The importer's rules (importers/paypal.ts): completed, USD, not a hold or a transfer; fee rows; refunds
    // sent; payments received from anyone but a marketplace.
    const kept = rows.filter((r) => {
      if (r.Status !== "Completed" || r.Currency !== "USD") return false;
      if (/\bhold\b|withdrawal|currency conversion/i.test(r.Type)) return false;
      if (/\bfee\b/i.test(r.Type)) return true;
      const credit = r["Balance Impact"] === "Credit";
      if (/refund/i.test(r.Type)) return !credit;
      return credit && !/\bebay\b/i.test(r.Name);
    });
    assert.equal(kept.length, PAYPAL_EXAMPLE.length);
    kept.forEach((r, i) => {
      const ex = PAYPAL_EXAMPLE[i];
      const kind = /\bfee\b/i.test(r.Type) ? "fee" : /refund/i.test(r.Type) ? "refund" : "sale";
      assert.equal(ex.kind, kind, ex.title);
      assert.equal(ex.grossCents, money(r.Gross), ex.title);
      assert.equal(ex.netCents, money(r.Net), ex.title);
      assert.equal(ex.shipCents, money(r["Shipping and Handling Amount"]), ex.title);
      assert.equal(ex.taxCents, money(r["Sales Tax"]), ex.title);
      // A fee row's fee is its own gross; otherwise PayPal signs the Fee cell against the seller.
      assert.equal(ex.feeCents, kind === "fee" ? -money(r.Gross) : -money(r.Fee), ex.title);
      if (kind !== "fee") assert.equal(ex.grossCents - ex.feeCents, ex.netCents, ex.title);
    });
    // The importer's own rules the example relies on.
    const imp = appFile("src/worker/services/importers/paypal.ts");
    assert.match(imp, /itemCents: Math\.max\(0, gross - shipping - tax\)/);
    assert.match(imp, /shippingChargedCents: shipping/);
    assert.match(imp, /amountCents: -feeRaw/);
    assert.match(imp, /amountCents: -gross/);
    assert.match(imp, /\/\^completed\$\/i/);
    assert.match(imp, /\[\/\\bebay\\b\/i, "eBay"\]/);
    const sc = appFile("src/worker/services/books/schedule-c.ts");
    assert.match(sc, /gross \+= s\.itemCents \+ s\.shippingChargedCents/);
    assert.match(sc, /else returns \+= s\.refundCents/);
    assert.match(sc, /else add\(c\.kind === "advertising" \? "8" : "10", c\.amountCents\)/);
  });

  test("the Schedule C lines, by hand, and the Net cross-check", () => {
    assert.deepEqual(paypalLines(), {
      line1: 12500,
      line2: 2000,
      line10: 2523,
      salesTax: 350,
      net: 8327,
    });
    const L = paypalLines();
    assert.equal(L.line1 - L.line2 - L.line10, L.net - L.salesTax);
    const html = htmlOf(page());
    for (const s of ["$125.00", "$20.00", "$25.23", "$3.50", "$83.27", "$79.77", "$0.40", "$8.00"])
      assert.ok(html.includes(s), s);
    for (const [row] of PAYPAL_LEFT_OUT) assert.ok(html.includes(row), row);
  });

  test("the IRS's own words, quoted with the source and the dated check; nothing quoted from PayPal", () => {
    const html = htmlOf(page());
    assert.match(PAYPAL_CHECKED_ON, /^\d{4}-\d{2}-\d{2}$/);
    for (const q of [
      IRS_1099K_THRESHOLD_QUOTE,
      IRS_PERSONAL_PAYMENTS_QUOTE,
      IRS_MARK_NON_BUSINESS_QUOTE,
    ])
      assert.ok(html.includes(q) || html.includes(quoted(q)), q);
    assert.ok(
      html.includes('href="https://www.irs.gov/businesses/understanding-your-form-1099-k"'),
    );
    assert.ok(html.includes('"@type":"FAQPage"'));
    assert.ok(!/paypal\.com/.test(html), "no PayPal page was readable, so none is cited");
    // The disclaimer every page carries.
    assert.ok(html.includes(quoted(NOT_TAX_ADVICE)) || html.includes(NOT_TAX_ADVICE));
  });

  test("linked from the PayPal platform page, every footer, llms.txt and the sitemap", () => {
    const link = `href="${BASE_PATH}/paypal-taxes"`;
    const plat = htmlOf(pages.find((p) => p.path === "/platforms/paypal"));
    assert.ok(plat.includes(link));
    assert.ok(plat.includes("one month of activity worked through"));
    assert.ok(htmlOf(pages.find((p) => p.path === "/")).includes(link));
    assert.ok(read("llms.txt").includes(`${BASE_PATH}/paypal-taxes)`));
    assert.ok(read("sitemap.xml").includes(`${BASE_PATH}/paypal-taxes`));
  });
});
