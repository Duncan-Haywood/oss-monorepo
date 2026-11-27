// HU-020..026 against Annex I of NAV's Online Invoice System 3.0 interface specification
// (English, 2026.02.12): every calculation and summary warning, its formula, its "only runs
// if" condition, and its tolerance. eval/nav-annex1-calculations-2026-11-15.md has the table.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkNavInvoice } from "./hungary-nav.mjs";

const read = (f) => readFileSync(new URL(`./fixtures/hungary-nav/${f}`, import.meta.url), "utf8");
const foreign = read("foreign-currency.xml"); // EUR at 310
const simplified = read("simplified.xml"); // HUF
const modification = read("modification.xml");
const once = (xml, from, to) => {
  assert.equal(xml.split(from).length, 2, `"${from}" must occur once`);
  return xml.replace(from, to);
};
const findings = (xml) => checkNavInvoice(xml).findings;
const navCodes = (xml) => findings(xml).map((f) => f.nav).filter(Boolean);

// Every calculation, summary-data and type-mismatch warning code in Annex I (2026.02.12),
// with 690 and 700 (marked inactive there) left out.
const ANNEX_I = new Set(`INCORRECT_LINE_CALCULATION_NET_AMOUNT INCORRECT_LINE_CALCULATION_LINE_NET_AMOUNT_HUF
INCORRECT_LINE_CALCULATION_AGGREGATE_LINE_NET_AMOUNT_HUF INCORRECT_LINE_CALCULATION_LINE_VAT_AMOUNT_HUF
INCORRECT_LINE_CALCULATION_AGGREGATE_LINE_VAT_AMOUNT_HUF INCORRECT_LINE_CALCULATION_LINE_UNIT_PRICE_HUF
INCORRECT_LINE_CALCULATION_AGGREGATE_LINE_UNIT_PRICE_HUF INCORRECT_LINE_CALCULATION_GROSS_AMOUNT
INCORRECT_LINE_CALCULATION_LINE_GROSS_AMOUNT_NORMAL_HUF INCORRECT_LINE_CALCULATION_AGGREGATE_LINE_GROSS_AMOUNT_NORMAL_HUF
INCORRECT_LINE_CALCULATION_LINE_GROSS_AMOUNT_SIMPLIFIED_HUF INCORRECT_LINE_CALCULATION_LINE_GROSS_AMOUNT_NORMAL_SUM
INCORRECT_SUMMARY_DATA_VAT_PERCENTAGE INCORRECT_SUMMARY_DATA_VAT_DOMESTIC_REVERSE_CHARGE
INCORRECT_SUMMARY_DATA_VAT_DOMESTIC_REVERSE_CHARGE_NORMAL INCORRECT_SUMMARY_DATA_MARGIN_SCHEME_INDICATOR
INCORRECT_SUMMARY_DATA_MARGIN_SCHEME_INDICATOR_NORMAL INCORRECT_SUMMARY_DATA_VAT_AMOUNT_MISMATCH_NORMAL
INCORRECT_SUMMARY_DATA_BY_VATRATE INCORRECT_SUMMARY_CALCULATION_VAT_RATE_NET_AMOUNT_LINE
INCORRECT_SUMMARY_CALCULATION_VAT_RATE_NET_AMOUNT_HUF_LINE INCORRECT_SUMMARY_CALCULATION_INVOICE_NET_AMOUNT
INCORRECT_SUMMARY_CALCULATION_INVOICE_NET_AMOUNT_HUF INCORRECT_SUMMARY_CALCULATION_INVOICE_VAT_AMOUNT_SUMMARY
INCORRECT_SUMMARY_CALCULATION_INVOICE_VAT_AMOUNT_HUF_SUMMARY INCORRECT_SUMMARY_CALCULATION_INVOICE_GROSS_AMOUNT_SUMMARY
INCORRECT_SUMMARY_CALCULATION_INVOICE_GROSS_AMOUNT_HUF_SUMMARY INCORRECT_SUMMARY_CALCULATION_VAT_RATE_VAT_AMOUNT_SUMMARY
INCORRECT_SUMMARY_CALCULATION_VAT_RATE_VAT_AMOUNT_HUF_SUMMARY INCORRECT_SUMMARY_CALCULATION_INVOICE_GROSS_AMOUNT_LINE
INCORRECT_SUMMARY_CALCULATION_INVOICE_GROSS_AMOUNT_HUF_LINE INCORRECT_SUMMARY_CALCULATION_VAT_CONTENT_SUMMARY_SIMPLIFIED
INCORRECT_SUMMARY_CALCULATION_VAT_EXEMPTION_SUMMARY_SIMPLIFIED INCORRECT_SUMMARY_CALCULATION_VAT_OUT_OF_SCOPE_SUMMARY_SIMPLIFIED
INCORRECT_SUMMARY_CALCULATION_VAT_DOMESTIC_REVERSE_CHARGE_SUMMARY_SIMPLIFIED INCORRECT_SUMMARY_DATA_MARGIN_SCHEME_INDICATOR_SUMMARY_SIMPLIFIED
INCORRECT_SUMMARY_CALCULATION_VAT_AMOUNT_MISMATCH_SUMMARY_SIMPLIFIED INCORRECT_SUMMARY_CALCULATION_VAT_CONTENT_GROSS_AMOUNT_SUMMARY_SIMPLIFIED
INCORRECT_SUMMARY_CALCULATION_VAT_CONTENT_GROSS_AMOUNT_HUF_SUMMARY_SIMPLIFIED INCORRECT_SUMMARY_CALCULATION_INVOICE_VAT_AMOUNT
INCORRECT_SUMMARY_CALCULATION_INVOICE_VAT_AMOUNT_HUF INCORRECT_SUMMARY_CALCULATION_INVOICE_NET_AMOUNT_LINE_HUF
INCORRECT_SUMMARY_DATA_INVOICE_VAT_AMOUNT_HUF INCORRECT_SUMMARY_DATA_INVOICE_NET_AMOUNT_HUF
INCORRECT_SUMMARY_DATA_INVOICE_VAT_CONTENT_GROSS_AMOUNT_HUF INCORRECT_SUMMARY_DATA_INVOICE_GROSS_AMOUNT_HUF
INCORRECT_SUMMARY_DATA_INVOICE_VAT_RATE_NET_AMOUNT_HUF INCORRECT_SUMMARY_DATA_INVOICE_VAT_RATE_VAT_AMOUNT_HUF
INCORRECT_SUMMARY_DATA_INVOICE_NET_AMOUNT INCORRECT_SUMMARY_DATA_INVOICE_GROSS_AMOUNT
INCORRECT_SUMMARY_DATA_VAT_EXEMPTION_NORMAL INCORRECT_SUMMARY_DATA_VAT_OUT_OF_SCOPE_NORMAL
LINE_SUMMARY_TYPE_MISMATCH_LINE_SIMPLIFIED LINE_SUMMARY_TYPE_MISMATCH_LINE_NORMAL
LINE_SUMMARY_TYPE_MISMATCH_SUMMARY_SIMPLIFIED LINE_SUMMARY_TYPE_MISMATCH_SUMMARY_NORMAL`.split(/\s+/));

test("every NAV calculation code the module names is one Annex I lists", () => {
  // The earlier version cited INCORRECT_LINE_CALCULATION_VAT_AMOUNT, ..._VAT_RATE_GROSS_AMOUNT and
  // ..._VAT_RATE_VAT_AMOUNT_LINE, which Annex I does not have, and three renamed or phased-out names.
  const src = readFileSync(new URL("./hungary-nav.mjs", import.meta.url), "utf8");
  const cited = new Set();
  for (const m of src.matchAll(/(?:INCORRECT_(?:LINE_CALCULATION|SUMMARY_(?:CALCULATION|DATA))|LINE_SUMMARY_TYPE_MISMATCH)_[A-Z_]+/g)) cited.add(m[0]);
  // Prefixes built in template strings (`..._${"AGGREGATE_"}...`) end in an underscore.
  const unknown = [...cited].filter((c) => !c.endsWith("_") && !ANNEX_I.has(c));
  assert.deepEqual(unknown, []);
});

test("each HU-020..026 finding says which Annex I warning it mirrors, or that NAV has none", () => {
  const xml = foreign
    .replace("<lineVatAmount>32.40<", "<lineVatAmount>40.00<")
    .replace("<vatRateGrossAmount>3150.00<", "<vatRateGrossAmount>3300.00<")
    .replace("<invoiceGrossAmountHUF>7322944.00<", "<invoiceGrossAmountHUF>7400000.00<");
  const f = findings(xml).filter((x) => /^HU-02[0-6]$/.test(x.rule));
  assert.ok(f.length >= 4);
  for (const x of f) {
    assert.ok("nav" in x, x.message);
    if (x.nav) assert.ok(ANNEX_I.has(x.nav) && x.message.includes(x.nav), x.message);
    else assert.match(x.message, /own check: NAV's Annex I has no warning/);
  }
  assert.ok(f.some((x) => x.rule === "HU-021" && x.nav === null), "line VAT vs rate is ours");
  assert.ok(f.some((x) => x.path.endsWith("vatRateGrossAmount") && x.nav === null), "row gross is ours");
});

test("740: a discount in lineDiscountData comes off the expected net (discountValue or discountRate)", () => {
  // Line 1: 1500 x 2.00 = 3000.00.
  const withRate = once(foreign, "<unitPriceHUF>620.00</unitPriceHUF>", "<unitPriceHUF>620.00</unitPriceHUF><lineDiscountData><discountRate>0.1</discountRate></lineDiscountData>");
  const f = findings(withRate).find((x) => x.rule === "HU-020");
  assert.ok(f && /less the discount is 2700\.00/.test(f.message) && f.nav === "INCORRECT_LINE_CALCULATION_NET_AMOUNT", JSON.stringify(f));
  const withValue = once(foreign, "<unitPriceHUF>620.00</unitPriceHUF>", "<unitPriceHUF>620.00</unitPriceHUF><lineDiscountData><discountValue>300.00</discountValue></lineDiscountData>");
  assert.ok(findings(withValue).some((x) => x.rule === "HU-020" && /less the discount is 2700\.00/.test(x.message)));
  // A description alone (the discount already in the unit price) leaves quantity x price.
  const described = once(foreign, "<unitPriceHUF>620.00</unitPriceHUF>", "<unitPriceHUF>620.00</unitPriceHUF><lineDiscountData><discountDescription>in the price</discountDescription></lineDiscountData>");
  assert.ok(!findings(described).some((x) => x.rule === "HU-020"));
});

test("754: the forint gross against the forint net plus VAT", () => {
  const xml = once(foreign, "<lineGrossAmountNormalHUF>976500.00<", "<lineGrossAmountNormalHUF>990000.00<");
  assert.ok(navCodes(xml).includes("INCORRECT_LINE_CALCULATION_LINE_GROSS_AMOUNT_NORMAL_SUM"));
});

test("891: a VAT-rate row's forint VAT against its forint net", () => {
  const xml = once(foreign, "<vatRateVatAmountHUF>46500.00<", "<vatRateVatAmountHUF>50000.00<");
  assert.ok(navCodes(xml).includes("INCORRECT_SUMMARY_CALCULATION_VAT_RATE_VAT_AMOUNT_HUF_SUMMARY"));
});

test("941: the lines' forint nets against the forint net total", () => {
  const xml = once(foreign, "<invoiceNetAmountHUF>5927200.00<", "<invoiceNetAmountHUF>6100000.00<");
  assert.ok(navCodes(xml).includes("INCORRECT_SUMMARY_CALCULATION_INVOICE_NET_AMOUNT_LINE_HUF"));
});

test("1073: the gross total converted at the exchange rate", () => {
  const xml = once(foreign, "<invoiceGrossAmountHUF>7322944.00<", "<invoiceGrossAmountHUF>7400000.00<");
  const codes = navCodes(xml);
  assert.ok(codes.includes("INCORRECT_SUMMARY_DATA_INVOICE_GROSS_AMOUNT_HUF"));
  assert.ok(codes.includes("INCORRECT_SUMMARY_CALCULATION_INVOICE_GROSS_AMOUNT_HUF_SUMMARY"), "881, renamed from ..._GROSS_AMOUNT_HUF");
});

test("1090: a new invoice with a negative net total; a modification may have one", () => {
  const negative = (xml) => xml.replace(/<invoiceNetAmount>([0-9.]+)</, "<invoiceNetAmount>-$1<");
  assert.ok(navCodes(negative(foreign)).includes("INCORRECT_SUMMARY_DATA_INVOICE_NET_AMOUNT"));
  assert.ok(!navCodes(negative(modification)).includes("INCORRECT_SUMMARY_DATA_INVOICE_NET_AMOUNT"));
});

test("680: a VAT rate in the summary that no line uses", () => {
  const row = foreign.match(/<summaryByVatRate>[\s\S]*?<\/summaryByVatRate>/)[0];
  const zero = row.replace("<vatPercentage>0.05<", "<vatPercentage>0.18<").replace(/(Amount(?:HUF)?>)[0-9.]+</g, "$10.00<");
  const xml = once(foreign, row, row + zero);
  const f = findings(xml).find((x) => x.nav === "INCORRECT_SUMMARY_DATA_VAT_PERCENTAGE");
  assert.ok(f && /18% row but no line is at 18%/.test(f.message), JSON.stringify(findings(xml).map((x) => x.message)));
  assert.deepEqual(findings(foreign), []);
});

test("711: a domestic reverse-charge summary row with VAT", () => {
  const xml = foreign
    .replace(/<vatPercentage>0\.05<\/vatPercentage>/g, "<vatDomesticReverseCharge>true</vatDomesticReverseCharge>");
  assert.ok(navCodes(xml).includes("INCORRECT_SUMMARY_DATA_VAT_DOMESTIC_REVERSE_CHARGE_NORMAL"));
});

test("900, 930: a simplified gross total against its lines and its summary rows", () => {
  const xml = once(simplified, "<invoiceGrossAmount>33000<", "<invoiceGrossAmount>34000<");
  const codes = navCodes(xml);
  assert.ok(codes.includes("INCORRECT_SUMMARY_CALCULATION_INVOICE_GROSS_AMOUNT_LINE"));
  assert.ok(codes.includes("INCORRECT_SUMMARY_CALCULATION_INVOICE_VAT_AMOUNT"), "930, NAV's name for the gross check");
});

test("901, 931: the same in forints", () => {
  const codes = navCodes(once(simplified, "<invoiceGrossAmountHUF>33000<", "<invoiceGrossAmountHUF>34000<"));
  assert.ok(codes.includes("INCORRECT_SUMMARY_CALCULATION_INVOICE_GROSS_AMOUNT_HUF_LINE"));
  assert.ok(codes.includes("INCORRECT_SUMMARY_CALCULATION_INVOICE_VAT_AMOUNT_HUF"));
});

test("921: a VAT content's forint summary against its lines", () => {
  const codes = navCodes(once(simplified, "<vatContentGrossAmountHUF>24000<", "<vatContentGrossAmountHUF>25000<"));
  assert.ok(codes.includes("INCORRECT_SUMMARY_CALCULATION_VAT_CONTENT_GROSS_AMOUNT_HUF_SUMMARY_SIMPLIFIED"));
  assert.ok(codes.includes("INCORRECT_SUMMARY_DATA_INVOICE_VAT_CONTENT_GROSS_AMOUNT_HUF"), "1072 at rate 1");
});

test("910: a VAT content in the simplified summary that no line has", () => {
  const extra = "<summarySimplified><vatRate><vatContent>0.1525</vatContent></vatRate><vatContentGrossAmount>0</vatContentGrossAmount><vatContentGrossAmountHUF>0</vatContentGrossAmountHUF></summarySimplified>";
  const xml = once(simplified, "<summaryGrossData>", `${extra}<summaryGrossData>`);
  assert.ok(navCodes(xml).includes("INCORRECT_SUMMARY_CALCULATION_VAT_CONTENT_SUMMARY_SIMPLIFIED"));
});

test("1100: a new simplified invoice with a negative gross total", () => {
  const xml = once(simplified, "<invoiceGrossAmount>33000<", "<invoiceGrossAmount>-33000<");
  assert.ok(navCodes(xml).includes("INCORRECT_SUMMARY_DATA_INVOICE_GROSS_AMOUNT"));
});

test("the tolerance floor is 0.01 of a foreign currency, not one unit of it", () => {
  // Line 3: 27% of 120.00 is 32.40. 0.50 EUR off is past 1% (0.32) and past 0.01 EUR;
  // the earlier one-unit floor (1.00 EUR) let it through.
  const xml = once(foreign, "<lineVatAmount>32.40<", "<lineVatAmount>32.90<");
  assert.ok(findings(xml).some((x) => x.rule === "HU-021" && /Line 3/.test(x.message)));
  // 0.30 EUR off stays inside 1% of 32.40.
  assert.ok(!findings(once(foreign, "<lineVatAmount>32.40<", "<lineVatAmount>32.70<")).some((x) => x.rule === "HU-021"));
  // In forints the floor is max(1 HUF, 0.01 x rate) = 3.10 HUF at 310: 3 HUF off a small amount passes.
  assert.ok(!findings(once(foreign, "<unitPriceHUF>9.30<", "<unitPriceHUF>12.30<")).some((x) => x.rule === "HU-023" && /Line 3/.test(x.message)));
  assert.ok(findings(once(foreign, "<unitPriceHUF>9.30<", "<unitPriceHUF>13.00<")).some((x) => x.rule === "HU-023" && /Line 3/.test(x.message)));
});

test("820: a zero VAT-rate row is not summed against its lines", () => {
  // Annex I: "Only runs if the VAT base is not zero (vatRateNetAmount <> 0)".
  const xml = once(foreign, "<vatRateNetAmount>3000.00<", "<vatRateNetAmount>0.00<");
  assert.ok(!navCodes(xml).includes("INCORRECT_SUMMARY_CALCULATION_VAT_RATE_NET_AMOUNT_LINE"));
  assert.ok(navCodes(once(foreign, "<vatRateNetAmount>3000.00<", "<vatRateNetAmount>3100.00<")).includes("INCORRECT_SUMMARY_CALCULATION_VAT_RATE_NET_AMOUNT_LINE"));
});
