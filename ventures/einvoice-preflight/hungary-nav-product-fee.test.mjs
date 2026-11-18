// Product fee (termékdíj) checks, HU-033, on NAV's own product fee sample (Termekdijas szamla.xml):
// line 1 carries KT 801 (1200 kg x 19 = 22,800 HUF), line 2 KT 4MA (5 kg x 57) and KT 702
// (50 kg x 57); the DEPOSIT summary lists the three codes and productChargeSum 25,935.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkNavInvoice } from "./hungary-nav.mjs";

const sample = readFileSync(new URL("./fixtures/hungary-nav/product-fee.xml", import.meta.url), "utf8");
const fee = (xml) => checkNavInvoice(xml).findings.filter((f) => f.rule === "HU-033");
const edit = (re, to) => {
  assert.ok(typeof re === "string" ? sample.includes(re) : re.test(sample), `no match for ${re}`);
  return sample.replace(re, to);
};

test("NAV's product fee sample has no product fee finding", () => {
  assert.deepEqual(fee(sample), []);
  assert.deepEqual(checkNavInvoice(sample).findings, []);
});

test("780: quantity x rate against the summary row's amount, with NAV's 1% / 1 HUF tolerance", () => {
  const off = fee(edit(/(<productFeeData>\s*<productFeeCode>\s*<productCodeCategory>KT<\/productCodeCategory>\s*<productCodeValue>702<\/productCodeValue>[\s\S]*?<productFeeRate>)57\.00/, "$160.00"));
  assert.ok(off.some((f) => /PRODUCT_FEE_AMOUNT\)/.test(f.message) && /702/.test(f.message)));
  assert.ok(off.every((f) => f.severity === "warning"));
  // 22,800 +/- 1% is tolerated: 22,900 is not flagged by 780 (810 and 790 still compare with the lines).
  const near = fee(edit(/<productFeeAmount>22800\.00<\/productFeeAmount>(\s*<\/productFeeData>)/, "<productFeeAmount>22900.00</productFeeAmount>$1"));
  assert.ok(!near.some((f) => /PRODUCT_FEE_AMOUNT\)/.test(f.message)));
});

test("810 and 790: summary amount and productChargeSum against the lines", () => {
  const f = fee(edit("<productChargeSum>25935.00</productChargeSum>", "<productChargeSum>27000.00</productChargeSum>"));
  assert.equal(f.length, 1);
  assert.match(f[0].message, /AGGREGATE_PRODUCT_CHARGE_SUM/);
  // A line amount changed: 810 (by code) and 790 (the total) both fire; 780 does not (the summary is self-consistent).
  const g = fee(edit(/<productFeeAmount>2850\.00<\/productFeeAmount>(\s*<\/lineProductFeeContent>)/, "<productFeeAmount>3200.00</productFeeAmount>$1"));
  assert.ok(g.some((x) => /AMOUNT_SUMMARY/.test(x.message) && /702/.test(x.message)));
  assert.ok(g.some((x) => /AGGREGATE_PRODUCT_CHARGE_SUM/.test(x.message)));
});

test("480 and 490: quantity and unit by code", () => {
  const q = fee(edit("<productFeeQuantity>50.0000</productFeeQuantity>", "<productFeeQuantity>55.0000</productFeeQuantity>"));
  assert.ok(q.some((x) => /LINE_QUANTITY_SUMMARY_QUANTITY/.test(x.message) && /702/.test(x.message)));
  const u = fee(edit(/<productFeeMeasuringUnit>KG<\/productFeeMeasuringUnit>(\s*<productFeeRate>19)/, "<productFeeMeasuringUnit>DARAB</productFeeMeasuringUnit>$1"));
  assert.ok(u.some((x) => /LINE_MEASURING_SUMMARY/.test(x.message) && /801/.test(x.message)));
});

test("270, 280, 290: code types other than CSK or KT, and a type missing from the summary", () => {
  const f = fee(edit(/<productCodeCategory>KT<\/productCodeCategory>(\s*<productCodeValue>801<\/productCodeValue>\s*<\/productFeeCode>\s*<productFeeQuantity>1200\.00<)/, "<productCodeCategory>VTSZ</productCodeCategory>$1"));
  assert.ok(f.some((x) => /INCORRECT_PRODUCT_CODE_FEE_CATEGORY\)/.test(x.message)));
  assert.ok(f.some((x) => /FEE_CATEGORY_MISSING/.test(x.message)));
  const s = fee(edit(/<productCodeCategory>KT<\/productCodeCategory>(\s*<productCodeValue>801<\/productCodeValue>\s*<\/productFeeCode>\s*<productFeeQuantity>1200\.000<)/, "<productCodeCategory>VTSZ</productCodeCategory>$1"));
  assert.ok(s.some((x) => /FEE_SUMMARY_CATEGORY/.test(x.message)));
});

test("450, 651: obligated flag and line content must agree", () => {
  const noContent = fee(edit(/<lineProductFeeContent>\s*<productFeeCode>\s*<productCodeCategory>KT<\/productCodeCategory>\s*<productCodeValue>801<\/productCodeValue>[\s\S]*?<\/lineProductFeeContent>/, ""));
  assert.ok(noContent.some((x) => /OBLIGATED_CONTENT_EMPTY/.test(x.message) && /Line 1/.test(x.message)));
  const notObligated = fee(edit("<obligatedForProductFee>true</obligatedForProductFee>", "<obligatedForProductFee>false</obligatedForProductFee>"));
  assert.ok(notObligated.some((x) => /OBLIGATED_LINE/.test(x.message) && /Line 1/.test(x.message)));
});

test("460, 470, 471/670: summary and lines present together", () => {
  const noSummary = edit(/<productFeeSummary>[\s\S]*<\/productFeeSummary>/, "");
  assert.ok(fee(noSummary).some((x) => /OBLIGATED_SUMMARY_EMPTY/.test(x.message)));
  const noSummaryNotObligated = noSummary.replaceAll("<obligatedForProductFee>true</obligatedForProductFee>", "<obligatedForProductFee>false</obligatedForProductFee>");
  assert.ok(fee(noSummaryNotObligated).some((x) => /CONTENT_SUMMARY_EMPTY/.test(x.message)));
  const noLines = sample.replace(/<lineProductFeeContent>[\s\S]*?<\/lineProductFeeContent>/g, "").replaceAll("<obligatedForProductFee>true</obligatedForProductFee>", "");
  assert.ok(fee(noLines).some((x) => /MISSING_LINE_PRODUCT_FEE_CONTENT/.test(x.message)));
});

test("two summaries (REFUND and DEPOSIT): line comparisons are skipped and said so", () => {
  const block = sample.match(/<productFeeSummary>[\s\S]*<\/productFeeSummary>/)[0];
  const two = sample.replace(block, block.replace("DEPOSIT", "REFUND") + block);
  const r = checkNavInvoice(two);
  assert.deepEqual(r.findings.filter((f) => f.rule === "HU-033"), []);
  assert.ok(r.skipped.some((s) => s.rule === "HU-033" && /two productFeeSummary/.test(s.reason)));
});
