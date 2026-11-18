// Cross-check the plain Flux 10 e-reporting set (plain/flux10-fr.json, run by fontoxpath)
// against Saxon-JS running FNFE-MPE's own compiled XSLT (FNFE_RFE_INVOICE/Flux10/Flux10.xslt),
// on this repo's three made-up Flux 10 files (FNFE publishes no Flux 10 example) and on copies
// of each with one thing broken. Compares, per run, the multiset of control codes fired (the
// codes repeat across contexts, so a set would hide a missed second G1.09). Also counts the runs
// where neither engine fires but flux10.mjs's own checks (FR-F10-101..107) do.
//   node eval/flux10-crosscheck.mjs <France_RFE checkout> <flux10.sef.json>
// Needs `npm i --no-save slimdom fontoxpath saxon-js xslt3` (a node_modules beside this
// venture or on the module path). Make the SEF file with:
//   npx xslt3 -xsl:<checkout>/FNFE_RFE_INVOICE/Flux10/Flux10.xslt -export:flux10.sef.json -nogo -relocate:on
// The checkout is used only to check that the .xslt sits beside the .sch this set was built from.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { parseSvrl } from "../schematron-core.mjs";
import { createPlainRunner } from "../plain-schematron.mjs";
import { flux10Findings, readFlux10 } from "../flux10.mjs";

const [checkout, sef] = process.argv.slice(2);
if (!sef) throw new Error("usage: node eval/flux10-crosscheck.mjs <France_RFE checkout> <flux10.sef.json>");
if (!existsSync(join(checkout, "FNFE_RFE_INVOICE/Flux10/Flux10.sch"))) throw new Error("no FNFE_RFE_INVOICE/Flux10/Flux10.sch in the checkout");
const require = createRequire(import.meta.url);
const SaxonJS = require("saxon-js");
const { parseXmlDocument } = require("slimdom");
const runner = createPlainRunner({ fontoxpath: require("fontoxpath"), parseXml: (x) => parseXmlDocument(x) });
const rules = JSON.parse(readFileSync(new URL("../plain/flux10-fr.json", import.meta.url)));

const first = (re, f) => (x) => x.replace(re, f);
const all = (re, f) => (x) => x.replace(new RegExp(re.source, "g"), f);
const drop = (re) => (x) => x.replace(re, "");
const inInvoice = (frag) => first(/(<Invoice>\s*<ID>)/, frag + "$1");
export const MUTATIONS = [
  // Transmission header (TT-1..TT-15).
  ["doc-id-double-space", first(/(<ReportDocument>\s*<Id>)([^<]+)/, "$1A  B")],
  ["doc-id-51", first(/(<ReportDocument>\s*<Id>)([^<]+)/, `$1${"X".repeat(51)}`)],
  ["doc-id-accent", first(/(<ReportDocument>\s*<Id>)([^<]+)/, "$1$2é")],
  ["doc-id-lead-space", first(/(<ReportDocument>\s*<Id>)([^<]+)/, "$1 $2")],
  ["datetime-12", first(/(<DateTimeString>\d{12})\d{2}/, "$1")],
  ["datetime-1999", first(/(<DateTimeString>)\d{4}/, "$11999")],
  ["datetime-feb-30", first(/(<DateTimeString>)\d{8}/, "$120260230")],
  ["datetime-hour-25", first(/(<DateTimeString>\d{8})\d{2}/, "$125")],
  ["type-xx", first(/(<ReportDocument>[\s\S]*?<TypeCode>)[^<]+/, "$1XX")],
  ["type-re", first(/(<ReportDocument>[\s\S]*?<TypeCode>)[^<]+/, "$1RE")],
  ["both-reports", first(/(<\/Report>)/, "<PaymentsReport><ReportPeriod><StartDate>20261001</StartDate><EndDate>20261031</EndDate></ReportPeriod></PaymentsReport>$1")],
  ["no-report", drop(/<(TransactionsReport|PaymentsReport)>[\s\S]*<\/\1>/)],
  ["sender-scheme-0002", first(/(<Sender>\s*<Id schemeId=")[^"]+/, "$10002")],
  ["sender-id-5", first(/(<Sender>\s*<Id[^>]*>)[^<]+/, "$100031")],
  ["sender-role-se", first(/(<Sender>[\s\S]*?<RoleCode>)[^<]+/, "$1SE")],
  ["issuer-scheme-0009", first(/(<Issuer>\s*<Id schemeId=")[^"]+/, "$10009")],
  ["issuer-siren-8", first(/(<Issuer>\s*<Id[^>]*>)\d(\d{8})/, "$1$2")],
  ["issuer-siren-key", first(/(<Issuer>\s*<Id[^>]*>\d{8})(\d)/, (m, a, d) => a + ((+d + 1) % 10))],
  ["issuer-role-wk", first(/(<Issuer>[\s\S]*?<RoleCode>)[^<]+/, "$1WK")],
  // Period.
  ["period-equal", first(/(<StartDate>)(\d{8})(<\/StartDate>\s*<EndDate>)\d{8}/, "$1$2$3$2")],
  ["period-dashes", first(/(<ReportPeriod>\s*<StartDate>)(\d{4})(\d{2})(\d{2})/, "$1$2-$3-$4")],
  ["period-end-nov-30-ok", first(/(<ReportPeriod>[\s\S]*?<EndDate>)\d{8}/, "$120261130")],
  ["period-end-feb-31", first(/(<ReportPeriod>[\s\S]*?<EndDate>)\d{8}/, "$120270231")],
  ["period-start-2100", first(/(<ReportPeriod>\s*<StartDate>)\d{4}/, "$12100")],
  // 10.3 transactions.
  ["tx-category-xxx", first(/(<CategoryCode>)[^<]+/, "$1XXX")],
  ["tx-currency-usd", first(/(<TransactionsCurrency>)[^<]+/, "$1USD")],
  ["tx-currency-lower", first(/(<TransactionsCurrency>)[^<]+/, "$1eur")],
  ["tx-rate-21", first(/(<TaxSubtotal>\s*<TaxPercent>)[^<]+/, "$121")],
  ["tx-total-3dp", first(/(<Transactions>[\s\S]*?<TaxExclusiveAmount>)([\d.]+)/, "$1$20")],
  ["tx-total-plus-1", first(/(<Transactions>[\s\S]*?<TaxExclusiveAmount>)([\d.]+)/, (m, a, v) => a + (Number(v) + 1).toFixed(2))],
  ["tx-subtotal-tax-plus-5", first(/(<TaxSubtotal>[\s\S]*?<TaxTotal>)([\d.]+)/, (m, a, v) => a + (Number(v) + 5).toFixed(2))],
  ["tx-tax-not-rate", (x) => x.replace(/(<Transactions>[\s\S]*?<TaxTotal>)([\d.]+)([\s\S]*?<TaxSubtotal>[\s\S]*?<TaxTotal>)([\d.]+)/, (m, a, t, b, s) => a + (Number(t) + 9).toFixed(2) + b + (Number(s) + 9).toFixed(2))],
  ["tx-due-code-99", first(/(<Transactions>[\s\S]*?<TaxDueDateTypeCode>)[^<]+/, "$199")],
  ["tx-date-feb-30", first(/(<Transactions>\s*<Date>)\d{8}/, "$120260230")],
  ["tx-date-outside", first(/(<Transactions>\s*<Date>)\d{8}/, "$120261115")],
  ["tx-rate-twice", first(/(<TaxSubtotal>\s*<TaxPercent>)5\.5/, "$120")],
  // 10.1 invoices.
  ["inv-type-999", first(/(<Invoice>[\s\S]*?<TypeCode>)[^<]+/, "$1999")],
  ["inv-type-384-no-ref", first(/(<Invoice>[\s\S]*?<TypeCode>)380/, "$1384")],
  ["inv-credit-no-ref", drop(/<ReferencedDocument>[\s\S]*?<\/ReferencedDocument>/)],
  ["inv-process-z9", first(/(<BusinessProcess>\s*<ID>)[^<]+/, "$1Z9")],
  ["inv-b4-deposit", (x) => x.replace(/(<Invoice>[\s\S]*?<TypeCode>)380/, "$1386").replace(/(<BusinessProcess>\s*<ID>)[^<]+/, "$1B4")],
  ["inv-typeid-other", first(/(<TypeID>)[^<]+/, "$1urn.cpro.gouv.fr:1p0:einvoicingF2")],
  ["inv-id-space", first(/(<Invoice>\s*<ID>)([^<]+)/, "$1$2 ")],
  ["inv-id-36", first(/(<Invoice>\s*<ID>)([^<]+)/, `$1${"F".repeat(36)}`)],
  ["inv-issue-feb-30", first(/(<Invoice>[\s\S]*?<IssueDate>)\d{8}/, "$120260230")],
  ["inv-due-bad", first(/(<DueDate>)\d{8}/, "$12026-11-06")],
  ["inv-due-code-1", first(/(<Invoice>[\s\S]*?<TaxDueDateTypeCode>)[^<]+/, "$11")],
  ["inv-no-buyer-id", drop(/(?<=<Buyer>\s*)<CompanyId[^>]*>[^<]*<\/CompanyId>/)],
  ["inv-buyer-scheme-9999", first(/(<Buyer>\s*<CompanyId schemeId=")[^"]+/, "$19999")],
  ["inv-buyer-0223-19", first(/(<Buyer>\s*<CompanyId schemeId="0223">)[^<]+/, `$1DE${"9".repeat(17)}`)],
  ["inv-seller-siren-8", first(/(<Seller>\s*<CompanyId[^>]*>)\d(\d{8})/, "$1$2")],
  ["inv-seller-0228", first(/(<Seller>\s*<CompanyId schemeId=")0002("?>)\d+/, "$10228$212345")],
  ["inv-seller-0229", first(/(<Seller>\s*<CompanyId schemeId=")0002("?>)\d+/, "$10229$21234567890")],
  ["inv-seller-0227", first(/(<Seller>\s*<CompanyId schemeId=")0002("?>)\d+/, `$10227$2${"7".repeat(19)}`)],
  ["inv-seller-no-vat", drop(/(?<=<Seller>[\s\S]*?)<TaxRegistrationId[^>]*>[^<]*<\/TaxRegistrationId>/)],
  ["inv-all-no-vat", drop(/<TaxRegistrationId[^>]*>[^<]*<\/TaxRegistrationId>/g)],
  ["inv-seller-vat-key", first(/(<Seller>[\s\S]*?<TaxRegistrationId[^>]*>FR)\d{2}/, "$199")],
  ["inv-seller-vat-other-siren", first(/(<Seller>[\s\S]*?<TaxRegistrationId[^>]*>FR\d{2})\d{9}/, "$1200000008")],
  ["inv-vat-qualifier", first(/(<TaxRegistrationId qualifyingId=")[^"]+/, "$1TAX")],
  ["inv-country-lower", all(/(<CountryId>)[A-Z]{2}/, "$1fr")],
  ["inv-category-e-no-reason", (x) => x.replace(/(<TaxCategory>\s*<Code>)[^<]+/, "$1E").replace(/<TaxExemptionReasonCode>[^<]*<\/TaxExemptionReasonCode>/, "")],
  // G1.102: an exempt (E) subtotal needs the seller's or its tax representative's VAT number.
  ["inv-e-no-vat", (x) => x.replace(/(<TaxCategory>\s*<Code>)[^<]+/g, "$1E").replace(/<TaxRegistrationId[^>]*>[^<]*<\/TaxRegistrationId>/g, "")],
  ["inv-e-rep-vat", (x) => x.replace(/(<TaxCategory>\s*<Code>)[^<]+/g, "$1E").replace(/<TaxRegistrationId[^>]*>[^<]*<\/TaxRegistrationId>/g, "").replace(/(<\/Buyer>)/g, '$1<SellerTaxRepresentative><TaxRegistrationId schemeId="VAT">FR88100000009</TaxRegistrationId></SellerTaxRepresentative>')],
  ["inv-category-x", first(/(<TaxCategory>\s*<Code>)[^<]+/, "$1X")],
  ["inv-percent-21", first(/(<TaxCategory>[\s\S]*?<Percent>)[^<]+/, "$121")],
  ["inv-percent-20-tax-0", first(/(<TaxCategory>[\s\S]*?<Percent>)[^<]+/, "$120")],
  ["inv-tax-usd", first(/(<TaxAmount CurrencyCode=")EUR/, "$1USD")],
  ["inv-total-off", first(/(<MonetaryTotal>\s*<TaxExclusiveAmount>)([\d.]+)/, (m, a, v) => a + (Number(v) + 10).toFixed(2))],
  ["inv-total-comma", first(/(<MonetaryTotal>\s*<TaxExclusiveAmount>)(\d+)\.(\d+)/, "$1$2,$3")],
  ["inv-price-net-off", first(/(<PriceAmount>)([\d.]+)/, "$1125.00")],
  ["inv-price-negative", first(/(<AllowanceChargeAmount>)([\d.]+)/, "$1-$2")],
  ["inv-qty-5dp", first(/(<BilledQuantity[^>]*>)([\d.]+)/, "$1$2.12345")],
  ["inv-cnwvat-380", first(/(<TaxExemptionReasonCode>)[^<]+/, "$1VATEX-FR-CNWVAT")],
  ["inv-period-backwards", inInvoice("")],
  ["inv-line-period-backwards", first(/(<Line>)/, "$1")],
  ["inv-delivery-feb-29", first(/(<Delivery>\s*<Date>)\d{8}/, "$120270229")],
  ["inv-doc-allowance-bad", first(/(<MonetaryTotal>)/, '<AllowanceCharge ChargeIndicator="false"><Amount>10.001</Amount><TaxCategoryCode>XX</TaxCategoryCode><TaxPercent>21</TaxPercent></AllowanceCharge>$1')],
  ["inv-line-allowance-3dp", first(/(<\/BilledQuantity>)/, '$1<AllowanceCharge ChargeIndicator="false"><Amount>1.234</Amount></AllowanceCharge>')],
  ["inv-line-ref-bad", first(/(<\/BilledQuantity>)/, "$1<ReferencedDocument><ID>A  B</ID><IssueDate>2026-01-01</IssueDate></ReferencedDocument>")],
  ["inv-line-delivery-lower", first(/(<\/Price>)/, "$1")],
  ["inv-ref-id-accent", first(/(<ReferencedDocument>\s*<ID>)([^<]+)/, "$1$2é")],
  ["inv-ref-date-dash", first(/(<ReferencedDocument>[\s\S]*?<IssueDate>)(\d{4})(\d{2})(\d{2})/, "$1$2-$3-$4")],
  // 10.2 / 10.4 payments.
  ["pay-invoice-id-space", first(/(<InvoiceID>)([^<]+)/, "$1$2  X")],
  ["pay-issue-feb-30", first(/(<InvoiceID>[^<]*<\/InvoiceID>\s*<IssueDate>)\d{8}/, "$120260230")],
  ["pay-date-bad", first(/(<Payment>\s*<Date>)\d{8}/, "$12026-10-14")],
  ["pay-date-feb-30", first(/(<Payment>\s*<Date>)\d{8}/, "$120260230")],
  ["pay-date-outside", first(/(<Payment>\s*<Date>)\d{8}/, "$120261201")],
  ["pay-rate-21", first(/(<SubTotals>\s*<TaxPercent>)[^<]+/, "$121")],
  ["pay-currency-usd", first(/(<SubTotals>[\s\S]*?<CurrencyCode>)[^<]+/, "$1USD")],
  ["pay-currency-lower", all(/(<SubTotals>[\s\S]*?<CurrencyCode>)[^<]+/, "$1eur")],
  ["pay-amount-negative", first(/(<SubTotals>[\s\S]*?<Amount>)([\d.]+)/, "$1-$2")],
  ["pay-amount-7dp", first(/(<SubTotals>[\s\S]*?<Amount>)([\d.]+)/, "$1$20000001")],
  ["pay-tx-rate-21", first(/(<Transactions>\s*<Payment>[\s\S]*?<TaxPercent>)[^<]+/, "$121")],
  ["pay-tx-currency-usd", first(/(<Transactions>\s*<Payment>[\s\S]*?<CurrencyCode>)[^<]+/, "$1USD")],
  ["pay-tx-date-bad", first(/(<Transactions>\s*<Payment>\s*<Date>)\d{8}/, "$12026101")],
];
// Two mutations above are placeholders filled here (they insert optional blocks).
const set = (name, f) => { MUTATIONS[MUTATIONS.findIndex(([n]) => n === name)][1] = f; };
set("inv-period-backwards", first(/(<MonetaryTotal>)/, "<InvoicePeriod><StartDate>20261031</StartDate><EndDate>20261001</EndDate></InvoicePeriod>$1"));
set("inv-line-period-backwards", first(/(<\/BilledQuantity>)/, "$1<InvoicePeriod><StartDate>2026-10-01</StartDate><EndDate>20261001</EndDate></InvoicePeriod>"));
set("inv-line-delivery-lower", first(/(<\/BilledQuantity>)/, "$1<Delivery><Location><CountryId>de</CountryId></Location></Delivery>"));

const seeds = ["b2c-transactions.xml", "international-invoices.xml", "payments.xml"];
const plainIds = (xml) => {
  const out = runner.runRules(rules, parseXmlDocument(xml));
  return { ids: out.map((f) => f.rule).sort(), skipped: out.skipped };
};
const saxonIds = (xml) => {
  const res = SaxonJS.transform({ stylesheetFileName: sef, sourceText: xml, destination: "serialized" });
  return parseSvrl(res.principalResult).map((f) => f.rule).sort();
};
const multiset = (ids) => ids.join(" ");

let runs = 0, agree = 0, fired = 0, skippedTotal = 0, gapOnly = 0, gapRuns = 0;
const disagreements = [];
const perMutation = {};
const idsSeen = new Set();
for (const file of seeds) {
  const base = readFileSync(new URL(`../fixtures/flux10/${file}`, import.meta.url), "utf8");
  const cases = [["original", base], ...MUTATIONS.map(([name, f]) => [name, f(base)]).filter(([, x]) => x !== base)];
  for (const [name, xml] of cases) {
    const p = plainIds(xml);
    const s = saxonIds(xml);
    runs++;
    skippedTotal += p.skipped.length;
    s.forEach((id) => idsSeen.add(id));
    perMutation[name] ??= { runs: 0, fired: 0, agree: 0, gapOnly: 0 };
    perMutation[name].runs++;
    const gaps = flux10Findings(readFlux10(xml)).filter((f) => f.rule !== "FR-F10-100");
    if (gaps.length) gapRuns++;
    if (!s.length && gaps.length) { perMutation[name].gapOnly++; gapOnly++; }
    if (s.length) { fired++; perMutation[name].fired++; }
    if (multiset(p.ids) === multiset(s)) { agree++; perMutation[name].agree++; }
    else disagreements.push({ file, mutation: name, plain: multiset(p.ids), saxon: multiset(s), skipped: p.skipped });
  }
}
console.log(`seeds: ${seeds.length}; runs (seed x mutation that changed it, plus originals): ${runs}; Saxon fired at least one control on ${fired}; same multiset of control codes on both engines: ${agree}/${runs}; plain checks skipped (engine limit): ${skippedTotal}`);
console.log(`runs where flux10.mjs's own checks (FR-F10-101..107) raise something: ${gapRuns}; of them, runs neither engine flags: ${gapOnly}`);
for (const [name, m] of Object.entries(perMutation)) console.log(`  ${name.padEnd(28)} runs ${m.runs}  fired ${m.fired}  agree ${m.agree}/${m.runs}${m.gapOnly ? `  caught only by FR-F10 ${m.gapOnly}` : ""}`);
const allIds = [...new Set(rules.patterns.flatMap((p) => p.rules.flatMap((r) => r.checks.map((c) => c.id))))].sort();
console.log(`control codes in the set: ${allIds.length}; fired by Saxon on some run: ${allIds.filter((id) => idsSeen.has(id)).length}; never fired: ${allIds.filter((id) => !idsSeen.has(id)).join(" ") || "none"}`);
for (const d of disagreements) console.log(`DIFF ${d.file} [${d.mutation}] plain: ${d.plain || "-"}; Saxon: ${d.saxon || "-"}${d.skipped.length ? `; skipped: ${d.skipped.join(" ")}` : ""}`);
