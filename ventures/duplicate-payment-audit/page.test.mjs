import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('landing page exposes searchable product, full disclaimer, and local app', () => {
  assert.match(html, /Duplicate Payment Audit/);
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, financial, or accounting advice/i);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /src="app\.mjs"/);
  assert.match(html, /Download review CSV/);
  assert.match(html, /Files are never uploaded/);
  assert.match(html, /does not determine that any payment was fraudulent/i);
});

test('the results panel wires every element app.mjs writes into', () => {
  for (const id of ['checked', 'flagged', 'highConfidence', 'table', 'results', 'download', 'message', 'window', 'usage', 'ledger', 'run']) {
    assert.match(html, new RegExp(`id="${id}"`), `index.html is missing #${id}`);
  }
});

test('editing the date window and pressing Enter re-runs the check, not only the button click', () => {
  const appSource = fs.readFileSync(new URL('./app.mjs', import.meta.url), 'utf8');
  assert.match(
    appSource,
    /\$\('window'\)\.addEventListener\('keydown', event => \{ if \(event\.key === 'Enter'\) \{ event\.preventDefault\(\); run\(\); \} \}\)/,
    'no Enter-key handler on #window calling run()',
  );
  assert.match(appSource, /\$\('run'\)\.addEventListener\('click', run\)/, 'run() is not shared between the click and Enter-key paths');
});

test('index links one hop to the payment-reconciliation-workbench sibling', () => {
  assert.match(
    html,
    /href="\.\.\/payment-reconciliation-workbench\/"/,
    'index must link ../payment-reconciliation-workbench/ so crawlers reach the sibling AP tool in one hop',
  );
});

test('index links to the vs-prgx comparison page, and the page exists with the required disclosures', () => {
  assert.match(html, /href="vs-prgx\.html"/);
  const vsHtml = fs.readFileSync(new URL('./vs-prgx.html', import.meta.url), 'utf8');
  assert.match(vsHtml, /PRGX/);
  assert.match(vsHtml, /not affiliated with, endorsed by, or sponsored by PRGX/i);
  assert.match(vsHtml, /No warranty/);
  assert.match(vsHtml, /href="\.\/"/, 'vs-prgx.html must link back to the calculator');
});

test('vs-prgx.html is listed in the sitemap', () => {
  const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /vs-prgx\.html/);
});

// An upload-only tool shows a first-time visitor nothing at all until they
// have already gone and exported their ledger, so the worked example is the
// only path that demonstrates the product before it asks for data. These
// assertions pin the fixture to the behaviour it is supposed to show: if a
// future tuning of `detectDuplicates` stops flagging one of the four tiers,
// the demo would quietly start under-selling the tool, and that is exactly
// the failure a reader would never notice.
test('the bundled worked example exercises every tier detectDuplicates can report', async () => {
  const app = fs.readFileSync(new URL('./app.mjs', import.meta.url), 'utf8');
  const match = app.match(/const EXAMPLE_CSV = `([\s\S]*?)`;/);
  assert.ok(match, 'app.mjs must carry an inline EXAMPLE_CSV fixture');

  const { readRecords, detectDuplicates } = await import('./detect.mjs');
  const { records, hasInvoiceColumn } = readRecords(match[1]);
  assert.ok(hasInvoiceColumn, 'the example must include an invoice column, or two of the three passes never run');

  const flags = detectDuplicates(records, { dateWindowDays: 7 });
  const tiers = new Set(flags.map(f => f.tier));
  for (const tier of ['exact-duplicate', 'same-invoice-different-amount', 'near-duplicate-invoice', 'same-amount-near-date']) {
    assert.ok(tiers.has(tier), `the worked example must produce a ${tier} finding`);
  }
  // Some rows must stay quiet too: a fixture where everything flags would
  // misrepresent the tool as flagging indiscriminately.
  const flaggedRows = new Set(flags.flatMap(f => [f.a.row, f.b.row]));
  assert.ok(records.length > flaggedRows.size, 'the example must contain rows that correctly do not flag');
});

test('the worked example is reachable from a control on the page', () => {
  assert.match(html, /id="loadExample"/);
  assert.match(html, /Load a worked example/);
});

test('index links to the same-invoice-two-amounts guide page, and the page exists with the required disclosures', () => {
  assert.match(html, /href="why-does-the-same-invoice-at-two-amounts-get-flagged\.html"/);
  const guideHtml = fs.readFileSync(new URL('./why-does-the-same-invoice-at-two-amounts-get-flagged.html', import.meta.url), 'utf8');
  assert.match(guideHtml, /No warranty/);
  assert.match(guideHtml, /Nothing leaves your browser/);
  assert.match(guideHtml, /href="\.\/"/, 'the guide page must link back to the calculator');
  assert.match(guideHtml, /href="LICENSE"/);
});

test('the same-invoice-two-amounts guide page is listed in the sitemap', () => {
  const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /why-does-the-same-invoice-at-two-amounts-get-flagged\.html/);
});

test("the same-invoice-two-amounts guide page's worked example matches the bundled EXAMPLE_CSV and detectDuplicates exactly", async () => {
  const app = fs.readFileSync(new URL('./app.mjs', import.meta.url), 'utf8');
  const match = app.match(/const EXAMPLE_CSV = `([\s\S]*?)`;/);
  assert.ok(match, 'app.mjs must carry an inline EXAMPLE_CSV fixture');

  const { readRecords, detectDuplicates } = await import('./detect.mjs');
  const { records } = readRecords(match[1]);
  const flags = detectDuplicates(records, { dateWindowDays: 7 });
  const flag = flags.find(f => f.tier === 'same-invoice-different-amount');
  assert.ok(flag, 'the bundled example must still produce a same-invoice-different-amount finding');
  assert.equal(flag.a.vendor, 'Cascade Freight Lines');
  assert.equal(flag.a.invoice, 'INV-88120');

  const guideHtml = fs.readFileSync(new URL('./why-does-the-same-invoice-at-two-amounts-get-flagged.html', import.meta.url), 'utf8');
  assert.ok(guideHtml.includes(flag.reason), "the guide page must quote detectDuplicates's own reason text verbatim");
  assert.match(guideHtml, /\$2,450\.00/);
  assert.match(guideHtml, /\$245\.00/);
});

test('every visible FAQ question and answer on the same-invoice-two-amounts guide page also appears in its FAQPage block', () => {
  const guideHtml = fs.readFileSync(new URL('./why-does-the-same-invoice-at-two-amounts-get-flagged.html', import.meta.url), 'utf8');
  const questions = [...guideHtml.matchAll(/<h3>([^<]+)<\/h3>/g)].map(m => m[1]);
  assert.ok(questions.length >= 4);
  const blocks = [...guideHtml.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
  const faq = blocks.find(b => b['@type'] === 'FAQPage');
  assert.ok(faq, 'missing FAQPage JSON-LD on the guide page');
  const faqNames = faq.mainEntity.map(q => q.name);
  for (const question of questions) assert.ok(faqNames.includes(question), `question not in FAQPage: ${question}`);
  for (const { name, acceptedAnswer } of faq.mainEntity) {
    assert.ok(guideHtml.includes(name), `question not found verbatim: ${name}`);
    assert.ok(guideHtml.includes(acceptedAnswer.text), `answer not found verbatim for: ${name}`);
  }
});
