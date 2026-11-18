// HU-034 (Annex I section I.1, invoice header) and HU-035 (section I.2, line data) against NAV's
// Online Invoice System 3.0 interface specification (English, 2026.02.12). Each test seeds one
// fault into one of NAV's own sample files and expects the Annex I code, then checks the
// boundary NAV draws (5 days, 15 days, 397 days, the county list). The table of which
// warnings a file can show is eval/nav-annex1-head-lines-2026-11-15.md.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ANNEX_I_HEAD_LINE_CODES, budapestToday, checkNavInvoice } from "./hungary-nav.mjs";

const read = (f) => readFileSync(new URL(`./fixtures/hungary-nav/${f}`, import.meta.url), "utf8");
const foreign = read("foreign-currency.xml"); // NORMAL, EUR, DOMESTIC customer, issued 2021-05-15, delivered 2021-05-10
const simplified = read("simplified.xml");
const modification = read("modification.xml"); // issued 2021-05-20
const aggregate = read("aggregate.xml");
const request = read("manageInvoice.xml");
const once = (xml, from, to) => {
  assert.equal(xml.split(from).length, 2, `"${from}" must occur once`);
  return xml.replace(from, to);
};
const codes = (xml, opts = { reportDate: xml.match(/invoiceIssueDate>([^<]+)/)?.[1] }) =>
  checkNavInvoice(xml, opts).findings.filter((f) => f.rule === "HU-034" || f.rule === "HU-035").map((f) => f.nav);

test("NAV's samples raise no I.1 or I.2 warning when reported on their issue date, except the aggregate's 2019 line dates", () => {
  for (const xml of [foreign, simplified, modification, read("several-vat-types.xml"), read("product-fee.xml")]) assert.deepEqual(codes(xml), []);
  assert.deepEqual(codes(aggregate), ["INCORRECT_DATE_AGGREGATE_INVOICE_DELIVERY_DATE"]);
  assert.deepEqual(codes(aggregate.replaceAll("<lineDeliveryDate>2019-05-13", "<lineDeliveryDate>2021-05-13")), []);
});

test("every cited code is in the list, and the list holds no deprecated or registry-only warning", () => {
  const src = readFileSync(new URL("./hungary-nav.mjs", import.meta.url), "utf8");
  const block = src.slice(src.indexOf("function checkAnnexHeadAndLines"), src.indexOf("// --- Product fee"));
  const cited = new Set([...block.matchAll(/"((?:INCORRECT|SUPPLIER)_[A-Z0-9_]+)"/g)].map((m) => m[1]));
  for (const c of cited) assert.ok(ANNEX_I_HEAD_LINE_CODES.includes(c) || ANNEX_I_HEAD_LINE_CODES.some((k) => k.startsWith(c)), c);
  for (const gone of ["SUPPLIER_CUSTOMER_MATCH_NAME", "INCORRECT_HEAD_DATA_CUSTOMER_COMMUNITY_VAT_NUMBER", "INCORRECT_CITY_ZIP_CODE_SUPPLIER", "INCORRECT_HEAD_DATA_EXCHANGE_RATE_1", "INCORRECT_HEAD_DATA_CUSTOMER_TAX_NUMBER"]) {
    assert.ok(!ANNEX_I_HEAD_LINE_CODES.includes(gone), gone);
  }
});

test("10: the customer given the seller's tax number", () => {
  assert.deepEqual(codes(once(foreign, "<base:taxpayerId>99887764</base:taxpayerId>", "<base:taxpayerId>99999999</base:taxpayerId>")), ["SUPPLIER_CUSTOMER_MATCH_TAXPAYER"]);
});

test("20: identical bank accounts only for an OTHER customer", () => {
  const withAccount = once(foreign, "</customerAddress>", "</customerAddress>\n<customerBankAccountNumber>12345678-12345678-12345678</customerBankAccountNumber>");
  assert.deepEqual(codes(withAccount), []); // DOMESTIC: the warning does not run
  const other = once(once(withAccount, "<customerVatStatus>DOMESTIC</customerVatStatus>", "<customerVatStatus>OTHER</customerVatStatus>"),
    /<customerVatData>[\s\S]*?<\/customerVatData>/.exec(withAccount)[0], "<customerVatData><thirdStateTaxId>123456</thirdStateTaxId></customerVatData>");
  assert.deepEqual(codes(other), ["SUPPLIER_CUSTOMER_MATCH_BANKACCOUNT"]);
});

test("50, 120, 140: VAT code and county codes, at NAV's list edges", () => {
  assert.deepEqual(codes(once(foreign, "<base:vatCode>2</base:vatCode>\n\t\t\t\t\t\t<base:countyCode>41", "<base:vatCode>4</base:vatCode>\n\t\t\t\t\t\t<base:countyCode>41")), ["INCORRECT_VAT_CODE_SUPPLIER"]);
  assert.deepEqual(codes(once(foreign, "<base:vatCode>2</base:vatCode>\n\t\t\t\t\t\t<base:countyCode>41", "<base:vatCode>5</base:vatCode>\n\t\t\t\t\t\t<base:countyCode>41")), []);
  for (const [county, want] of [["21", ["INCORRECT_COUNTY_CODE_SUPPLIER"]], ["01", ["INCORRECT_COUNTY_CODE_SUPPLIER"]], ["45", ["INCORRECT_COUNTY_CODE_SUPPLIER"]], ["20", []], ["22", []], ["44", []]]) {
    assert.deepEqual(codes(once(foreign, "<base:countyCode>41</base:countyCode>", `<base:countyCode>${county}</base:countyCode>`)), want, county);
  }
  assert.deepEqual(codes(once(foreign, "<base:countyCode>02</base:countyCode>", "<base:countyCode>50</base:countyCode>")), ["INCORRECT_COUNTY_CODE_CUSTOMER"]);
});

test("30, 40, 530, 100, 160, 200: a fiscal representative who repeats the seller", () => {
  const fiscal = `<fiscalRepresentativeInfo>
    <fiscalRepresentativeTaxNumber><base:taxpayerId>99999999</base:taxpayerId><base:vatCode>3</base:vatCode><base:countyCode>99</base:countyCode></fiscalRepresentativeTaxNumber>
    <fiscalRepresentativeName>Értékesítő Kft</fiscalRepresentativeName>
    <fiscalRepresentativeAddress><base:simpleAddress><base:countryCode>DE</base:countryCode><base:postalCode>10115</base:postalCode><base:city>Berlin</base:city><base:additionalAddressDetail>Hauptstr. 1</base:additionalAddressDetail></base:simpleAddress></fiscalRepresentativeAddress>
  </fiscalRepresentativeInfo>
  <invoiceDetail>`;
  const xml = once(foreign, "<invoiceDetail>", fiscal);
  assert.deepEqual(codes(xml).sort(), ["INCORRECT_COUNTRY_CODE_FISCALREPRESENTATIVEADDRESS", "INCORRECT_COUNTY_CODE_FISCALREPRESENTATIVE", "INCORRECT_HEAD_DATA_FISCALREPRESENTATIVE",
    "INCORRECT_VAT_CODE_FISCALREPRESENTATIVE", "SUPPLIER_FISCAL_MATCH_NAME", "SUPPLIER_FISCAL_MATCH_TAXPAYER"]);
  // A foreign seller (county 51) with its own Hungarian representative: nothing.
  const good = once(once(once(once(once(xml, "<base:taxpayerId>99999999</base:taxpayerId><base:vatCode>3</base:vatCode><base:countyCode>99", "<base:taxpayerId>99887764</base:taxpayerId><base:vatCode>2</base:vatCode><base:countyCode>02"),
    "<fiscalRepresentativeName>Értékesítő Kft", "<fiscalRepresentativeName>Képviselő Kft"), "<base:countryCode>DE</base:countryCode><base:postalCode>10115</base:postalCode><base:city>Berlin",
    "<base:countryCode>HU</base:countryCode><base:postalCode>1051</base:postalCode><base:city>Budapest"), "<base:countyCode>41</base:countyCode>", "<base:countyCode>51</base:countyCode>"),
    "<customerVatStatus>DOMESTIC", "<customerVatStatus>DOMESTIC");
  assert.deepEqual(codes(good), []);
});

test("500: the seller's EU VAT number must end with its tax number", () => {
  const eu = (v) => once(foreign, "</supplierTaxNumber>", `</supplierTaxNumber>\n<communityVatNumber>${v}</communityVatNumber>`);
  assert.deepEqual(codes(eu("HU12345678")), ["INCORRECT_HEAD_DATA_SUPPLIER_COMMUNITY_VAT_NUMBER"]);
  assert.deepEqual(codes(eu("HU99999999")), []);
});

test("82: a VAT group's own number (177...) given as the customer's group member", () => {
  const g = (id) => once(foreign, "<base:countyCode>02</base:countyCode>\n\t\t\t\t\t\t</customerTaxNumber>",
    `<base:countyCode>02</base:countyCode>\n<groupMemberTaxNumber><base:taxpayerId>${id}</base:taxpayerId><base:vatCode>4</base:vatCode><base:countyCode>41</base:countyCode></groupMemberTaxNumber></customerTaxNumber>`);
  assert.ok(codes(g("17781230")).includes("INCORRECT_HEAD_DATA_CUSTOMER_GROUPMEMBER_TAXNUMBER"));
  assert.ok(!codes(g("12345676")).includes("INCORRECT_HEAD_DATA_CUSTOMER_GROUPMEMBER_TAXNUMBER"));
});

test("313: delivery 397 days or more after issue", () => {
  assert.deepEqual(codes(once(foreign, "<invoiceDeliveryDate>2021-05-10", "<invoiceDeliveryDate>2022-06-16")), ["INCORRECT_DATE_INVOICE_DELIVERY_DATE_LATE"]); // 397 days
  assert.deepEqual(codes(once(foreign, "<invoiceDeliveryDate>2021-05-10", "<invoiceDeliveryDate>2022-06-15")), []); // 396
});

test("310 and 312 against the day of reporting; without one they are listed as skipped", () => {
  assert.deepEqual(codes(foreign, { reportDate: "2021-05-09" }), ["INCORRECT_DATE_INVOICE_ISSUE_DATE_LATE"]); // issued 6 days later
  assert.deepEqual(codes(foreign, { reportDate: "2021-05-10" }), []); // 5 days: tolerated
  // (Six years on, Annex II's late-report note 10311 is there too.)
  assert.deepEqual(codes(foreign, { reportDate: "2027-12-31" }), ["INCORRECT_DATE_INVOICE_ISSUE_DATE_EARLY"]); // lapsed before 2021-01-01
  assert.deepEqual(codes(foreign, { reportDate: "2028-01-01" }).sort(), ["INCORRECT_DATE_INVOICE_DELIVERY_DATE_EARLY", "INCORRECT_DATE_INVOICE_ISSUE_DATE_EARLY"]); // before 2022-01-01
  const r = checkNavInvoice(foreign);
  assert.ok(r.skipped.some((s) => s.rule === "HU-034" && /310, 312, 340, 341/.test(s.reason)));
  assert.match(budapestToday(new Date("2026-11-15T23:30:00Z")), /^2026-11-16$/); // Budapest is UTC+1 in November
});

test("340 and 341: a modifying document's issue date against the day of reporting", () => {
  assert.deepEqual(codes(modification, { reportDate: "2021-06-04" }), ["INCORRECT_DATE_INVOICE_MODIFICATION_ISSUE_DATE_EARLY"]); // 15 days
  assert.deepEqual(codes(modification, { reportDate: "2021-06-03" }), []); // 14 days
  assert.deepEqual(codes(modification, { reportDate: "2021-05-14" }).sort(), ["INCORRECT_DATE_INVOICE_ISSUE_DATE_LATE", "INCORRECT_DATE_INVOICE_MODIFICATION_ISSUE_DATE_LATE"]);
  assert.ok(!codes(foreign, { reportDate: "2021-06-30" }).includes("INCORRECT_DATE_INVOICE_MODIFICATION_ISSUE_DATE_EARLY")); // not a modification
});

test("Annex II 10311: a new invoice reported more than 10 days after issue is noted, as information", () => {
  // foreign-currency.xml is issued 2021-05-15.
  assert.deepEqual(codes(foreign, { reportDate: "2021-05-25" }), []); // 10 days: tolerated
  assert.deepEqual(codes(foreign, { reportDate: "2021-05-26" }), ["INCORRECT_DATE_INVOICE_ISSUE_DATE_EARLY"]);
  const f = checkNavInvoice(foreign, { reportDate: "2021-05-26" }).findings.find((x) => x.nav === "INCORRECT_DATE_INVOICE_ISSUE_DATE_EARLY");
  assert.equal(f.severity, "information");
  assert.match(f.message, /11 days before/);
  // CREATE only: a modification 11 days old gets 340's window, not 10311.
  assert.ok(!codes(modification, { reportDate: "2021-05-31" }).includes("INCORRECT_DATE_INVOICE_ISSUE_DATE_EARLY"));
});

test("a manageInvoice request's own timestamp is the day of reporting", () => {
  // Issued 2020-09-04, timestamp 2020-09-11: an option of 2020-08-01 would raise 310 if it were used.
  const r = checkNavInvoice(request, { reportDate: "2020-08-01" });
  assert.ok(!r.findings.some((f) => f.nav === "INCORRECT_DATE_INVOICE_ISSUE_DATE_LATE"));
  assert.ok(!r.skipped.some((s) => s.rule === "HU-034"));
});

test("an impossible calendar date is not compared", () => {
  // 2022-06-31 does not exist; a naive Date.parse rolls it to 1 July 2022, 412 days after the 2021-05-15 issue.
  assert.ok(!codes(once(foreign, "<invoiceDeliveryDate>2021-05-10", "<invoiceDeliveryDate>2022-06-31")).includes("INCORRECT_DATE_INVOICE_DELIVERY_DATE_LATE"));
});

test("320 and 321: an aggregate invoice's dates against its lines", () => {
  const fixed = aggregate.replaceAll("<lineDeliveryDate>2019-05-13", "<lineDeliveryDate>2021-05-13");
  assert.deepEqual(codes(fixed.replace("<invoiceIssueDate>2021-05-15", "<invoiceIssueDate>2021-05-12")), ["INCORRECT_DATE_AGGREGATE_INVOICE_ISSUE_DATE"]);
  assert.deepEqual(codes(once(fixed, "<invoiceDeliveryDate>2021-05-13", "<invoiceDeliveryDate>2021-05-14")), ["INCORRECT_DATE_AGGREGATE_INVOICE_DELIVERY_DATE"]);
});

test("561: delivery period dates without periodicalSettlement true", () => {
  const period = (extra) => once(foreign, "<invoiceDeliveryDate>2021-05-10</invoiceDeliveryDate>",
    `<invoiceDeliveryDate>2021-05-10</invoiceDeliveryDate>\n<invoiceDeliveryPeriodStart>2021-04-01</invoiceDeliveryPeriodStart>\n<invoiceDeliveryPeriodEnd>2021-04-30</invoiceDeliveryPeriodEnd>${extra}`);
  assert.deepEqual(codes(period("")), ["INCORRECT_HEAD_DATA_PERIODICAL_SETTLEMENT"]);
  assert.deepEqual(codes(period("\n<periodicalSettlement>false</periodicalSettlement>")), ["INCORRECT_HEAD_DATA_PERIODICAL_SETTLEMENT"]);
  assert.deepEqual(codes(period("\n<periodicalSettlement>true</periodicalSettlement>")), []);
});

test("590: a line that refers to itself", () => {
  assert.deepEqual(codes(once(foreign, "<lineNumber>2</lineNumber>", "<lineNumber>2</lineNumber>\n<referencesToOtherLines><referenceToOtherLine>2</referenceToOtherLine></referencesToOtherLines>")), ["INCORRECT_LINE_DATA_SELF_LINE_NUMBER"]);
  assert.deepEqual(codes(once(foreign, "<lineNumber>2</lineNumber>", "<lineNumber>2</lineNumber>\n<referencesToOtherLines><referenceToOtherLine>1</referenceToOtherLine></referencesToOtherLines>")), []);
});

test("597: a margin-scheme line with VAT; TRAVEL_AGENCY is left alone", () => {
  const LINE5 = "<vatPercentage>0.05</vatPercentage>\n\t\t\t\t\t\t</lineVatRate>";
  const m = (v) => once(foreign, LINE5, `<marginSchemeIndicator>${v}</marginSchemeIndicator></lineVatRate>`);
  assert.ok(codes(m("SECOND_HAND")).includes("INCORRECT_LINE_DATA_MARGIN_SCHEME_INDICATOR_NORMAL"));
  assert.ok(!codes(m("TRAVEL_AGENCY")).includes("INCORRECT_LINE_DATA_MARGIN_SCHEME_INDICATOR_NORMAL"));
});

test("595: a domestic reverse-charge line with VAT", () => {
  const LINE5 = "<vatPercentage>0.05</vatPercentage>\n\t\t\t\t\t\t</lineVatRate>";
  assert.ok(codes(once(foreign, LINE5, "<vatDomesticReverseCharge>true</vatDomesticReverseCharge></lineVatRate>")).includes("INCORRECT_LINE_DATA_VAT_DOMESTIC_REVERSE_CHARGE_NORMAL"));
});

test("631: aggregate line data on a normal invoice", () => {
  const withAgg = once(foreign, "<unitPriceHUF>3100.00</unitPriceHUF>", "<unitPriceHUF>3100.00</unitPriceHUF>\n<aggregateInvoiceLineData><lineExchangeRate>310</lineExchangeRate><lineDeliveryDate>2021-05-10</lineDeliveryDate></aggregateInvoiceLineData>");
  assert.ok(codes(withAgg).includes("INCORRECT_LINE_DATA_AGGREGATE_INVOICE_LINE_DATA"));
});

test("5810: KBAET on a simplified invoice to a customer that is not OTHER", () => {
  const m = /<lineAmountsSimplified>\s*<lineVatRate>\s*(<vatContent>[\d.]+<\/vatContent>)/.exec(simplified);
  assert.ok(m, "simplified sample has a vatContent line");
  const xml = simplified.replace(m[0], m[0].replace(m[1], "<vatExemption><case>KBAET</case><reason>Közösségen belüli</reason></vatExemption>"));
  assert.match(simplified, /<customerVatStatus>DOMESTIC</);
  assert.ok(codes(xml).includes("INCORRECT_LINE_DATA_VAT_STATUS_VAT_DATA_MISMATCH_KBAET_SIMPLIFIED"));
});

test("600 and 630: line amounts missing, or simplified amounts on a normal invoice", () => {
  const block = /<lineAmountsNormal>[\s\S]*?<\/lineAmountsNormal>/.exec(foreign)[0];
  assert.ok(codes(once(foreign, block, "")).includes("INCORRECT_LINE_DATA_LINE_AMOUNTS_NORMAL_MANDATORY"));
  const simple = "<lineAmountsSimplified><lineVatRate><vatContent>0.0476</vatContent></lineVatRate><lineGrossAmountSimplified>3150.00</lineGrossAmountSimplified></lineAmountsSimplified>";
  assert.ok(codes(once(foreign, block, simple)).includes("INCORRECT_LINE_DATA_LINE_AMOUNTS_SIMPLIFIED_NOT_ALLOWED"));
});

test("585 and 587: the exemption case against the customer's kind of tax number", () => {
  const LINE5 = "<vatPercentage>0.05</vatPercentage>\n\t\t\t\t\t\t</lineVatRate>";
  // KBAET to a customer with a Hungarian tax number.
  const kbaet = once(foreign, LINE5, "<vatExemption><case>KBAET</case><reason>Közösségen belüli</reason></vatExemption></lineVatRate>");
  assert.ok(codes(kbaet).includes("INCORRECT_LINE_DATA_VAT_DATA_MISMATCH_KBAET"));
  // EAM (export) to a customer given an EU VAT number.
  const other = once(once(foreign, "<customerVatStatus>DOMESTIC</customerVatStatus>", "<customerVatStatus>OTHER</customerVatStatus>"),
    /<customerVatData>[\s\S]*?<\/customerVatData>/.exec(foreign)[0], "<customerVatData><communityVatNumber>DE123456789</communityVatNumber></customerVatData>");
  const eam = once(other, LINE5, "<vatExemption><case>EAM</case><reason>Export</reason></vatExemption></lineVatRate>");
  assert.ok(codes(eam).includes("INCORRECT_LINE_DATA_VAT_DATA_MISMATCH_EAM"));
  // KBAET to that EU customer: right.
  const kbaetEu = once(other, LINE5, "<vatExemption><case>KBAET</case><reason>Közösségen belüli</reason></vatExemption></lineVatRate>");
  assert.ok(!codes(kbaetEu).some((c) => /VAT_DATA_MISMATCH/.test(c)));
});

test("435: a summary rate with a value that no line carries", () => {
  const xml = once(foreign, "<vatPercentage>0.05</vatPercentage>\n\t\t\t\t\t\t</lineVatRate>", "<vatPercentage>0.18</vatPercentage>\n\t\t\t\t\t\t</lineVatRate>");
  assert.ok(codes(xml).includes("INCORRECT_LINE_DATA_BY_VATRATE"));
});
