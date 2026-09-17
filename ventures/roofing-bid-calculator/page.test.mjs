// Structural tests for the calculator pages.
//
// These exist because a sibling calculator (cut-list optimizer) shipped with
// an unclosed <textarea> that swallowed the module script. calc.test.mjs
// stayed green because it imports calc.mjs directly. The checks below are
// dependency-free so CI stays a plain `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const RAW_TEXT_ELEMENTS = ['textarea', 'script', 'style'];

function parse(source) {
  const RAW = /<(textarea|script|style)\b[^>]*>/i;
  let rest = source;
  let markup = '';
  const scripts = [];
  for (;;) {
    const open = rest.match(RAW);
    if (!open) return { markup: markup + rest, scripts, unclosed: null };
    const tag = open[1].toLowerCase();
    const contentStart = open.index + open[0].length;
    markup += rest.slice(0, contentStart);
    const closer = new RegExp(`</${tag}\\s*>`, 'i').exec(rest.slice(contentStart));
    if (!closer) return { markup, scripts, unclosed: tag };
    if (tag === 'script') scripts.push(rest.slice(contentStart, contentStart + closer.index));
    markup += closer[0];
    rest = rest.slice(contentStart + closer.index + closer[0].length);
  }
}

function load(name) {
  const html = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
  return { html, ...parse(html) };
}

const page = load('index.html');
const article = load('how-to-price-a-roof-by-the-square.html');
const declaredIds = new Set([...page.markup.matchAll(/\bid="([\w-]+)"/g)].map((m) => m[1]));
const scriptSource = page.scripts.join('\n');

test('every raw-text element on the calculator is closed', () => {
  assert.equal(page.unclosed, null, `<${page.unclosed}> is never closed`);
  for (const tag of RAW_TEXT_ELEMENTS) {
    const opened = (page.html.match(new RegExp(`<${tag}[\\s>]`, 'gi')) || []).length;
    const closed = (page.html.match(new RegExp(`</${tag}\\s*>`, 'gi')) || []).length;
    assert.equal(opened, closed, `<${tag}> is opened ${opened}x but closed ${closed}x`);
  }
});

test('the module script survives parsing and would actually execute', () => {
  assert.match(page.markup, /<script type="module">/);
  assert.match(scriptSource, /calculateBid/);
});

test('every element the script reaches for exists in the markup', () => {
  const wanted = new Set([
    ...[...scriptSource.matchAll(/getElementById\(\s*'([\w-]+)'\s*\)/g)].map((m) => m[1]),
    ...[...scriptSource.matchAll(/\bel\(\s*'([\w-]+)'\s*\)/g)].map((m) => m[1]),
  ]);
  assert.ok(wanted.size > 0, 'no element lookups found; the script probably did not parse');
  const missing = [...wanted].filter((id) => !declaredIds.has(id));
  assert.deepEqual(missing, [], `script queries ids that no element declares: ${missing.join(', ')}`);
});

test('inputs and result fields for the primary journey are present', () => {
  for (const id of [
    'sections', 'addSection', 'materialPreset', 'wastePercent', 'materialPerSquare',
    'hourlyWage', 'targetMargin', 'proposedPrice', 'price', 'squares', 'breakEven',
    'copySummary', 'usageOptOut', 'split', 'verdict',
  ]) {
    assert.ok(declaredIds.has(id), `#${id} is missing from index.html`);
  }
});

test('the liability disclaimer and privacy note are real markup', () => {
  assert.match(page.markup, /<strong>No warranty\.<\/strong>/);
  assert.match(page.markup, /Nothing leaves your browser/);
});

test('search and assistant discovery basics ship with the page', () => {
  assert.match(page.html, /<title>Roofing Bid Calculator/);
  assert.match(page.html, /name="description"/);
  assert.match(page.html, /application\/ld\+json/);
  assert.match(page.html, /SoftwareApplication/);
  assert.match(page.html, /how-to-price-a-roof-by-the-square\.html/);
});

test('every module the page imports exists and exports what it names', async () => {
  const imports = [...scriptSource.matchAll(/import\s*\{([^}]+)\}\s*from\s*'([^']+)'/g)];
  assert.ok(imports.length >= 2);
  for (const [, names, specifier] of imports) {
    const module = await import(new URL(specifier, import.meta.url).href);
    for (const name of names.split(',').map((n) => n.trim()).filter(Boolean)) {
      const value = module[name];
      assert.ok(value !== undefined, `${specifier} does not export ${name}`);
    }
  }
});

test('the how-to page is closed, crawlable, and points back at the calculator', () => {
  assert.equal(article.unclosed, null);
  assert.match(article.html, /<title>How to price a roof by the square/);
  assert.match(article.html, /name="description"/);
  assert.match(article.html, /FAQPage/);
  assert.match(article.markup, /href="\.\/"/);
  assert.match(article.markup, /<strong>No warranty\.<\/strong>/);
});

const proposalMarkup = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const proposalIds = new Set([...proposalMarkup.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const proposalScript = /<script type="module">([\s\S]*)<\/script>/.exec(proposalMarkup)[1];

test('the customer-facing proposal has every field and control it needs', () => {
  for (const id of [
    'companyName', 'companyPhone', 'companyEmail', 'companyLicense', 'companyAddress',
    'clientName', 'clientAddress', 'depositPercent', 'validDays',
    'proposalScope', 'proposalExclusions', 'paymentTerms', 'proposalNotes',
    'printProposal', 'forgetCompany', 'proposalStatus', 'proposalDoc',
  ]) {
    assert.ok(proposalIds.has(id), `missing #${id}`);
  }
  assert.match(proposalScript, /buildProposal/, 'the proposal builder is missing from the executable script');
  assert.match(proposalScript, /renderProposalHtml/);
  assert.match(proposalScript, /window\.print\(\)/, 'nothing actually sends the proposal to the printer');
});

test('printing sends the customer sheet and hides the contractor\u2019s own numbers', () => {
  const print = /@media print\s*\{([\s\S]*?)\n    \}/.exec(proposalMarkup);
  assert.ok(print, 'no print stylesheet; the browser would print the whole calculator');
  // The cost breakdown, wages, and margin all live inside <main>. If <main>
  // printed, the customer would receive the contractor's loaded labour rate.
  assert.match(print[1], /main[^;{]*\{?[^}]*display:\s*none/i,
    'the calculator UI is not excluded from the printed sheet');
  assert.match(print[1], /\.pr-shell\s*\{[^}]*display:\s*block/i,
    'the proposal is not shown on the printed sheet');
});

test('the proposal promises the customer\u2019s details are not stored', () => {
  assert.match(proposalMarkup, /customer&rsquo;s details are never saved|customer\u2019s details are never saved/,
    'the privacy claim the module actually enforces should be stated on the page');
});

// Closest sibling: same exterior contractor, same elevation, but the wall wrap rather than the roof. Related-tool chrome rotates inside the
// Roofing, siding & gutters subcategory, so without an explicit one-hop a crawler on this page
// may never land on that tool.
test('index links one hop to the siding-bid-calculator sibling', () => {
  const siblingPage = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(
    siblingPage,
    /href="\.\.\/siding-bid-calculator\/"/,
    'index must link ../siding-bid-calculator/ so crawlers reach it in one hop',
  );
  assert.match(siblingPage, /siding bid calculator/i);
});
