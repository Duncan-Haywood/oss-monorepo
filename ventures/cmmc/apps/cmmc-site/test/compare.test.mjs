// The "CMMC compliance software compared" page: every other product's price cites a registered source
// read on COMPARE_CHECKED, our own prices are the plans.mjs ones, the "about $183/mo" FutureFeed figure
// is the arithmetic of its own published prices, and the page is linked from pricing and home.
import assert from "node:assert/strict";
import { test } from "node:test";
import { COMPARE_CHECKED, COMPARE_PATH, compareRows } from "../src/compare.mjs";
import { buildPages } from "../src/pages.mjs";
import { publicPlans } from "../src/plans.mjs";
import { source } from "../src/site.mjs";

const cite = (id, text) => `<a href="${source(id).url}" data-source="${id}">${text ?? id}</a>`;

for (const paidOn of [false, true]) {
  test(`every row with another product's $ figure cites a source read ${COMPARE_CHECKED} (paidOn=${paidOn})`, () => {
    const rows = compareRows({ cite, paidOn });
    assert.ok(rows.length >= 6);
    for (const r of rows) {
      if (r.src === null) continue;
      // A vendor row (its name cites the vendor page) was re-read on the compare date.
      if (r.name.includes(`data-source="${r.src}"`))
        assert.equal(
          source(r.src).checked,
          COMPARE_CHECKED,
          `${r.src} re-read on the compare date`,
        );
      if (/\$\d/.test(r.price))
        assert.ok(
          r.name.includes(`data-source="${r.src}"`) || r.price.includes("data-source="),
          `${r.src}: a $ figure with no cited source`,
        );
      else assert.match(r.price, /[Qq]uote|no published price/, `${r.src}: no price means "quote"`);
    }
    // Rows without a source are ours and the free spreadsheet; neither may name another vendor's price.
    for (const r of rows.filter((x) => x.src === null))
      assert.doesNotMatch(r.covers + r.fits, /\$\d/, "no outside $ figure without a source");
  });
}

test("our row's prices are the app's plans, and 'not on sale yet' follows the switch", () => {
  const plans = publicPlans();
  const l2 = plans.find((p) => p.key === "level2");
  const ours = (paidOn) =>
    compareRows({ cite, paidOn }).find((r) => r.src === null && !r.price.startsWith("$0"));
  const usd = (c) => `$${Math.round(c / 100).toLocaleString("en-US")}`;
  assert.ok(ours(false).price.includes(`${usd(l2.priceCents)}/mo`));
  assert.ok(ours(false).price.includes(`${usd(l2.annualPriceCents)}/yr`));
  assert.match(ours(false).price, /not on sale yet/);
  assert.doesNotMatch(ours(true).price, /not on sale yet/);
});

test("'about $183/mo' is FutureFeed's own Innovator annual price plus its Level 2 add-on", () => {
  const note = source("futurefeed-pricing").note;
  const monthly = Number(note.match(/\$(\d+)\/mo billed annually/)[1]);
  const addOn = Number(note.match(/add-on \$([\d,]+)\/yr/)[1].replace(",", ""));
  assert.equal(Math.round(monthly + addOn / 12), 183);
});

test("the page is built, says where a rival is cheaper, and is linked from home and pricing", () => {
  const pages = buildPages();
  const page = pages.find((p) => p.path === COMPARE_PATH);
  assert.ok(page, "compare page built");
  assert.match(page.body, /Where another option is the better buy/);
  assert.match(page.body, /about \$183 a month/);
  for (const path of ["/", "/pricing"])
    assert.ok(
      pages.find((p) => p.path === path).body.includes(`href="${COMPARE_PATH}"`),
      `${path} links the compare page`,
    );
});

test("the $2,200–$5,400 a year range is FutureFeed's and PreVeil's published prices, ours inside it", () => {
  const ff = source("futurefeed-pricing").note;
  const ffYear =
    Number(ff.match(/\$(\d+)\/mo billed annually/)[1]) * 12 +
    Number(ff.match(/add-on \$([\d,]+)\/yr/)[1].replace(",", ""));
  const pv = Number(source("preveil-pass").note.match(/\$(\d+)\/mo/)[1]) * 12;
  assert.equal(Math.round(ffYear / 100) * 100, 2200);
  assert.equal(pv, 5400);
  const l2 = publicPlans().find((p) => p.key === "level2");
  assert.ok(l2.annualPriceCents / 100 > ffYear && l2.annualPriceCents / 100 < pv);
  const page = buildPages().find((p) => p.path === COMPARE_PATH);
  assert.match(page.body, /\$2,200–\$5,400 a year/);
});
