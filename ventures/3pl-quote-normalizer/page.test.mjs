import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('calculator includes the report region used by the page script', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /querySelector\('#report'\)/);
  assert.match(page, /id="report"/);
  assert.match(page, /aria-label="Copyable quote review report"/);
});

test('page exposes the line-by-line review export', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /Show line-by-line export/);
  assert.match(page, /summary\(r\)/);
  assert.match(page, /id="report"/);
});

test('calculator copy falls back when the Clipboard API is denied', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /function fallbackCopy/);
  assert.match(page, /execCommand\('copy'\)/);
  assert.match(page, /async function copyText/);
});

test('page persists quote inputs locally', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /localStorage\.setItem\(saveKey/);
  assert.match(page, /localStorage\.getItem\(saveKey/);
  assert.match(page, /Saved locally in this browser/);
});

test('negotiation page builds a copyable brief without recommending a provider', async () => {
  const page = await readFile(new URL('./negotiation.html', import.meta.url), 'utf8');
  assert.match(page, /negotiationBrief/);
  assert.match(page, /Copy brief/);
  assert.match(page, /not recommend a provider/);
  assert.match(page, /not financial, tax, legal, or engineering advice/);
  assert.match(page, /github.com\/sponsors\/Duncan-Haywood/);
  const index = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const compare = await readFile(new URL('./compare.html', import.meta.url), 'utf8');
  assert.match(index, /negotiation\.html/);
  assert.match(compare, /negotiation\.html/);
});

test('drivers page ranks saved quote lines without telling the user to negotiate', async () => {
  const page = await readFile(new URL('./drivers.html', import.meta.url), 'utf8');
  const index = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const sitemap = await readFile(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(page, /costDrivers/);
  assert.match(page, /cost_drivers_viewed/);
  assert.match(page, /not a script for the provider conversation/);
  assert.match(page, /not financial, tax, legal, or engineering advice/);
  assert.match(page, /Best-effort hosting, no SLA/);
  assert.match(page, /github.com\/sponsors\/Duncan-Haywood/);
  assert.doesNotMatch(page, /should negotiate|must ask|recommend a provider/);
  assert.match(index, /drivers\.html/);
  assert.match(sitemap, /drivers\.html/);
});

test('comparison page exposes two monthly quote inputs and disclaimer', async () => {
  const page = await readFile(new URL('./compare.html', import.meta.url), 'utf8');
  assert.match(page, /name="first"/);
  assert.match(page, /name="second"/);
  assert.match(page, /not financial, tax, legal, or engineering advice/);
  assert.match(page, /name="target"/);
  assert.match(page, /comparison_target_viewed/);
});

test('comparison page loads savings insights and provider labels', async () => {
  const page = await readFile(new URL('./compare.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('./comparison-insights.mjs', import.meta.url), 'utf8');
  assert.match(page, /comparison-insights\.mjs/);
  assert.match(script, /comparison_savings_viewed/);
  assert.match(script, /firstName/);
  assert.match(script, /annualDifference/);
});

test('comparison page exposes a local CSV export', async () => {
  const page = await readFile(new URL('./compare.html', import.meta.url), 'utf8');
  assert.match(page, /exportComparisonCsv/);
  assert.match(page, /comparison_csv_exported/);
  assert.match(page, /3pl-quote-comparison\.csv/);
});

test('comparison page offers a shareable link that restores from the URL fragment', async () => {
  const page = await readFile(new URL('./compare.html', import.meta.url), 'utf8');
  assert.match(page, /from "\.\/share\.mjs"/);
  assert.match(page, /id="copyLink"/);
  assert.match(page, /Copy comparison link/);
  assert.match(page, /decodeShare\(location\.hash\)/);
  assert.match(page, /encodeShare\(values\(\)\)/);
  assert.match(page, /comparison_link_copied/);
});

test('calculator keeps input warnings in the copied report path', async () => {
  const script = await readFile(new URL('./calc.mjs', import.meta.url), 'utf8');
  assert.match(script, /Input warnings/);
  assert.match(script, /inputWarnings/);
});

test('calculator surfaces input warnings in the live decision snapshot', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('./warnings-page.mjs', import.meta.url), 'utf8');
  assert.match(page, /warnings-page\.mjs/);
  assert.match(script, /role/);
  assert.match(script, /textContent = warning/);
});

test('calculator exposes editable return fee assumptions', async () => {
  const script = await readFile(new URL('./return-fields.js', import.meta.url), 'utf8');
  assert.match(script, /returnFee/);
  assert.match(script, /restockFee/);
  assert.match(script, /Return handling \/ order/);
});

test('dedicated export page uses the live calculator record and is linked', async () => {
  const page = await readFile(new URL('./export.html', import.meta.url), 'utf8');
  const index = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const sitemap = await readFile(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(page, /exportCsv/);
  assert.match(page, /exportJson/);
  assert.match(page, /review_record_exported/);
  assert.match(page, /3pl-quote-normalized\.csv/);
  assert.match(page, /not financial, tax, legal, or engineering advice/);
  assert.match(page, /Best-effort hosting, no SLA/);
  assert.match(page, /github.com\/sponsors\/Duncan-Haywood/);
  assert.match(index, /export\.html/);
  assert.match(sitemap, /export\.html/);
});

test('calculator exposes a local CSV export from its live form', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('./export-page.mjs', import.meta.url), 'utf8');
  assert.match(script, /new FormData\(form\)/);
  assert.match(script, /quote_csv_exported/);
  assert.match(page, /return-fields\.js/);
});

test('calculator exposes a privacy-safe local JSON export', async () => {
  const script = await readFile(new URL('./export-page.mjs', import.meta.url), 'utf8');
  const exporter = await readFile(new URL('./export.mjs', import.meta.url), 'utf8');
  assert.match(script, /Download JSON record/);
  assert.match(script, /quote_json_exported/);
  assert.match(exporter, /schema_version: 1/);
});

test('sensitivity page exposes volume assumptions, results, and disclaimer', async () => {
  const page = await readFile(new URL('./sensitivity.html', import.meta.url), 'utf8');
  assert.match(page, /Volume Sensitivity/);
  assert.match(page, /minimumMonthly/);
  assert.match(page, /volumeSensitivity/);
  assert.match(page, /not financial, tax, legal, or engineering advice/);
});

test('returns sensitivity page sweeps return rates and names the flip', async () => {
  const page = await readFile(new URL('./returns-sensitivity.html', import.meta.url), 'utf8');
  const index = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const sitemap = await readFile(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(page, /When Do 3PL Return Fees Make In-House Cheaper/);
  assert.match(page, /returnsSensitivity/);
  assert.match(page, /returnsSensitivitySummary/);
  assert.match(page, /name="returnFee"/);
  assert.match(page, /name="restockFee"/);
  assert.match(page, /returns_sensitivity_viewed/);
  assert.match(page, /not financial, tax, legal, or engineering advice/);
  assert.match(page, /Best-effort hosting, no SLA/);
  assert.match(index, /returns-sensitivity\.html/);
  assert.match(sitemap, /returns-sensitivity\.html/);
});

test('aged storage page compares leftover surcharge and names the flip', async () => {
  const page = await readFile(new URL('./does-long-term-storage-flip-a-3pl-quote.html', import.meta.url), 'utf8');
  const index = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const sitemap = await readFile(new URL('./sitemap.xml', import.meta.url), 'utf8');
  const robots = await readFile(new URL('./robots.txt', import.meta.url), 'utf8');
  assert.match(page, /Does Long-Term 3PL Storage Flip the Quote/);
  assert.match(page, /compareAgedStorage/);
  assert.match(page, /agedStorageSweep/);
  assert.match(page, /agedStorageSummary/);
  assert.match(page, /name="leftoverPallets"/);
  assert.match(page, /name="longTermStoragePerPallet"/);
  assert.match(page, /name="liquidationPerPallet"/);
  assert.match(page, /aged_storage_compared/);
  assert.match(page, /not financial, tax, legal, or engineering advice/);
  assert.match(page, /Best-effort hosting, no SLA/);
  assert.match(index, /does-long-term-storage-flip-a-3pl-quote\.html/);
  assert.match(sitemap, /does-long-term-storage-flip-a-3pl-quote\.html/);
  assert.match(robots, /Sitemap:/);
});

test('return disposition page compares restock, destroy, and customer-keeps', async () => {
  const page = await readFile(new URL('./should-i-restock-or-let-the-customer-keep-a-3pl-return.html', import.meta.url), 'utf8');
  const index = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const sitemap = await readFile(new URL('./sitemap.xml', import.meta.url), 'utf8');
  const robots = await readFile(new URL('./robots.txt', import.meta.url), 'utf8');
  assert.match(page, /Should I Restock a 3PL Return or Let the Customer Keep It/);
  assert.match(page, /compareReturnDisposition/);
  assert.match(page, /returnDispositionRestockableSweep/);
  assert.match(page, /returnDispositionUnitCostSweep/);
  assert.match(page, /returnDispositionSummary/);
  assert.match(page, /name="restockableRate"/);
  assert.match(page, /name="returnLabelCost"/);
  assert.match(page, /name="unitCost"/);
  assert.match(page, /name="keepOffer"/);
  assert.match(page, /return_disposition_compared/);
  assert.match(page, /not financial, tax, legal, or engineering advice/);
  assert.match(page, /Best-effort hosting, no SLA/);
  assert.match(index, /should-i-restock-or-let-the-customer-keep-a-3pl-return\.html/);
  assert.match(sitemap, /should-i-restock-or-let-the-customer-keep-a-3pl-return\.html/);
  assert.match(robots, /Sitemap:/);
});

test('inbound page compares pallet, carton, and loose receiving', async () => {
  const page = await readFile(new URL('./inbound.html', import.meta.url), 'utf8');
  const index = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const sitemap = await readFile(new URL('./sitemap.xml', import.meta.url), 'utf8');
  const robots = await readFile(new URL('./robots.txt', import.meta.url), 'utf8');
  assert.match(page, /name="palletInboundFee"/);
  assert.match(page, /name="cartonInboundFee"/);
  assert.match(page, /name="receivingPerUnit"/);
  assert.match(page, /compareInboundMethods/);
  assert.match(page, /inbound_methods_compared/);
  assert.match(page, /not financial, tax, legal/);
  assert.match(page, /Best-effort hosting, no SLA/);
  assert.match(page, /github.com\/sponsors\/Duncan-Haywood/);
  assert.match(index, /inbound.html/);
  assert.match(sitemap, /inbound.html/);
  assert.match(robots, /Sitemap:/);
  assert.match(index, /id="inbound-methods"/);
  assert.match(index, /compareInboundMethods/);
  assert.match(index, /inboundComparisonSummary/);
  assert.match(index, /name="palletInboundFee"/);
  assert.match(index, /name="cartonInboundFee"/);
  assert.match(index, /id="inboundRows"/);
  assert.match(index, /inbound_methods_compared/);
  const inboundTable = index.match(/<table id="inboundTable">[\s\S]*?<\/table>/);
  assert.ok(inboundTable, "index.html is missing the inbound comparison table");
  const columns = inboundTable[0].match(/<th\b/g).length;
  const cells = (index.match(/function renderInbound[\s\S]*?<\/td><\/tr>`/) || [""])[0].match(/<t[hd]\b/g) || [];
  assert.equal(cells.length, columns, "renderInbound emits a different cell count than the header row");
});

test('calculator surfaces compareKitting on the quote itself', async () => {
  const index = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(index, /id="kitting"/);
  assert.match(index, /compareKitting/);
  assert.match(index, /kittingSummary/);
  assert.match(index, /id="kittingRows"/);
  assert.match(index, /kitting_compared/);
  assert.match(index, /name="kitFee"/);
  assert.match(index, /name="aovLift"/);
  const kittingTable = index.match(/<table id="kittingTable">[\s\S]*?<\/table>/);
  assert.ok(kittingTable, "index.html is missing the kitting comparison table");
  const columns = kittingTable[0].match(/<th\b/g).length;
  const cells = (index.match(/function renderKitting[\s\S]*?<\/td><\/tr>`/) || [""])[0].match(/<t[hd]\b/g) || [];
  assert.equal(cells.length, columns, "renderKitting emits a different cell count than the header row");
});

test('calculator surfaces compareReturnDisposition on the quote itself', async () => {
  const index = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(index, /id="return-disposition"/);
  assert.match(index, /compareReturnDisposition/);
  assert.match(index, /returnDispositionSummary/);
  assert.match(index, /id="dispositionRows"/);
  assert.match(index, /return_disposition_compared/);
  assert.match(index, /name="unitCost"/);
  assert.match(index, /name="restockableRate"/);
  const dispositionTable = index.match(/<table id="dispositionTable">[\s\S]*?<\/table>/);
  assert.ok(dispositionTable, "index.html is missing the return-disposition comparison table");
  const columns = dispositionTable[0].match(/<th\b/g).length;
  const cells = (index.match(/function renderDisposition[\s\S]*?<\/td><\/tr>`/) || [""])[0].match(/<t[hd]\b/g) || [];
  assert.equal(cells.length, columns, "renderDisposition emits a different cell count than the header row");
});

test('calculator surfaces compareAgedStorage on the quote itself', async () => {
  const index = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(index, /id="aged-storage"/);
  assert.match(index, /compareAgedStorage/);
  assert.match(index, /agedStorageSummary/);
  assert.match(index, /id="agedRows"/);
  assert.match(index, /aged_storage_compared/);
  assert.match(index, /name="leftoverPallets"/);
  assert.match(index, /name="longTermStoragePerPallet"/);
  const agedTable = index.match(/<table id="agedTable">[\s\S]*?<\/table>/);
  assert.ok(agedTable, "index.html is missing the aged-storage comparison table");
  const columns = agedTable[0].match(/<th\b/g).length;
  const cells = (index.match(/function renderAged[\s\S]*?<\/td><\/tr>`/) || [""])[0].match(/<t[hd]\b/g) || [];
  assert.equal(cells.length, columns, "renderAged emits a different cell count than the header row");
});

test('calculator builds a negotiation brief from the quote itself', async () => {
  const index = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const calc = await readFile(new URL('./calc.mjs', import.meta.url), 'utf8');
  assert.match(index, /id="negotiation-brief"/);
  assert.match(index, /negotiationLines/);
  assert.match(index, /id="negotiationBrief"/);
  assert.match(index, /id="copyNegotiation"/);
  assert.match(index, /negotiation_brief_copied_from_quote/);
  assert.match(index, /negotiation\.html/);
  // The brief must not carry the in-house comparison or break-even volume --
  // those are the sender's own competitive numbers, and this text is meant
  // to be safe to hand to the provider being negotiated with.
  assert.doesNotMatch(calc.match(/export function negotiationLines[\s\S]*?\n}/)[0], /inHouse|breakEvenOrders/);
});

test('negotiation page points back to the calculator’s own itemized brief', async () => {
  const page = await readFile(new URL('./negotiation.html', import.meta.url), 'utf8');
  assert.match(page, /index\.html/);
});

test('inbound SEO page explains the container-fee arithmetic', async () => {
  const page = await readFile(new URL('./pallet-vs-carton-inbound.html', import.meta.url), 'utf8');
  const index = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const sitemap = await readFile(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(page, /\$10/);
  assert.match(page, /inbound.html/);
  assert.match(page, /not financial, tax, legal/);
  assert.match(sitemap, /pallet-vs-carton-inbound.html/);
  // The explainer already linked back via inbound.html; the product index
  // shipped without a crawlable link of its own, so a visitor (or crawler)
  // on the tool never reached the search-phrase page in one hop.
  assert.match(
    index,
    /href="\.\/pallet-vs-carton-inbound\.html"/,
    'index must link the inbound SEO page so crawlers can reach it from the product',
  );
});

test('kitting page compares 3PL assembly, pre-kit, and skipping the bundle', async () => {
  const page = await readFile(new URL('./should-i-pay-the-3pl-to-kit.html', import.meta.url), 'utf8');
  const index = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const sitemap = await readFile(new URL('./sitemap.xml', import.meta.url), 'utf8');
  const robots = await readFile(new URL('./robots.txt', import.meta.url), 'utf8');
  assert.match(page, /Should I Pay the 3PL to Kit, or Skip the Bundle/);
  assert.match(page, /compareKitting/);
  assert.match(page, /kittingFeeSweep/);
  assert.match(page, /kittingAovSweep/);
  assert.match(page, /kittingSummary/);
  assert.match(page, /name="kitFee"/);
  assert.match(page, /name="aovLift"/);
  assert.match(page, /name="extraPicks"/);
  assert.match(page, /name="inHouseKitLabor"/);
  assert.match(page, /kitting_compared/);
  assert.match(page, /not financial, tax, legal, or engineering advice/);
  assert.match(page, /Best-effort hosting, no SLA/);
  assert.match(index, /should-i-pay-the-3pl-to-kit\.html/);
  assert.match(sitemap, /should-i-pay-the-3pl-to-kit\.html/);
  assert.match(robots, /Sitemap:/);
});

// Closest sibling: same monthly-cost-normalization shape, but a cloud storage
// bill rather than a fulfillment quote. Without a crawlable link here, a
// crawler entering on the 3PL quote normalizer never reaches the cloud
// egress calculator in one hop.
test('index links one hop to the cloud-egress-calculator sibling', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(
    page,
    /href="\.\.\/cloud-egress-calculator\/"/,
    'index must link ../cloud-egress-calculator/ so crawlers reach the cloud egress calculator in one hop',
  );
});

// Closest sibling after signing: this normalizer compares quotes before the
// contract, the invoice audit checker tests each invoice against it after.
test('index links one hop to the 3pl-invoice-audit-checker sibling', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /href="\.\.\/3pl-invoice-audit-checker\/"/);
});
