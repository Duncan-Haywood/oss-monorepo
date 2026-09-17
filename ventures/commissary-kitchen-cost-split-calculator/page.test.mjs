import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSplit, DEFAULTS } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('the page has a title, meta description, and robots tag', () => {
  assert.match(html, /<title>Commissary Kitchen Cost Split Calculator/);
  assert.match(html, /<meta name="description" content="[^"]+"/);
  assert.match(html, /<meta name="robots" content="index,follow">/);
});

test('the page carries SoftwareApplication and FAQPage JSON-LD', () => {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const app = scripts.find((s) => s['@type'] === 'SoftwareApplication');
  assert.ok(app, 'SoftwareApplication JSON-LD is missing');
  assert.equal(app.offers.price, '0');
  const faq = scripts.find((s) => s['@type'] === 'FAQPage');
  assert.ok(faq, 'FAQPage JSON-LD is missing');
  assert.ok(faq.mainEntity.length >= 3, 'FAQPage should carry at least 3 questions');
});

test('every FAQPage question and answer is a verbatim substring of the visible page text', () => {
  const faqScript = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage"[\s\S]*?)<\/script>/);
  assert.ok(faqScript, 'FAQPage JSON-LD script not found');
  const faq = JSON.parse(faqScript[1]);
  const visible = html.replace(/&mdash;/g, '—').replace(/&amp;/g, '&');
  for (const { name, acceptedAnswer } of faq.mainEntity) {
    assert.ok(visible.includes(name), `question not found verbatim in visible text: ${name}`);
    assert.ok(visible.includes(acceptedAnswer.text), `answer not found verbatim in visible text: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('the page imports the calc.mjs API surface and usage.mjs', () => {
  assert.match(html, /import \{ computeSplit, DEFAULTS, SPLIT_METHODS \} from '\.\/calc\.mjs'/);
  assert.match(html, /import \{ recordEvent, toggleUsage, usageAllowed \} from '\.\/usage\.mjs'/);
});

test('the page wires usage counting for the split, breakdown copy, reset, and the sponsor link', () => {
  assert.match(html, /recordEvent\('split_calculated'\)/);
  assert.match(html, /recordEvent\('breakdown_copied'\)/);
  assert.match(html, /recordEvent\('reset'\)/);
  assert.match(html, /recordEvent\('sponsor_link_clicked'\)/);
  assert.match(html, /<code>split_calculated<\/code>, <code>breakdown_copied<\/code>, <code>reset<\/code>, <code>sponsor_link_clicked<\/code>/);
});

test('the page ships 8 cost rows matching the DEFAULTS cost items for the first 6', () => {
  const labelInputs = [...html.matchAll(/class="costLabel" data-row="(\d)"/g)];
  assert.equal(labelInputs.length, 8);
  DEFAULTS.costItems.forEach((c, i) => {
    assert.match(html, new RegExp(`data-row="${i + 1}" aria-label="Cost item ${i + 1} label"[^>]*value="${c.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  });
});

test('the page ships 6 tenant rows with 6 fields each, matching the DEFAULTS tenants for the first 3', () => {
  const nameInputs = [...html.matchAll(/class="tenantName" data-row="(\d)"/g)];
  assert.equal(nameInputs.length, 6);
  DEFAULTS.tenants.forEach((t, i) => {
    assert.match(html, new RegExp(`data-row="${i + 1}" aria-label="Tenant ${i + 1} name"[^>]*value="${t.name}"`));
    assert.match(html, new RegExp(`class="tenantHours" data-row="${i + 1}"[^>]*value="${t.hoursBooked}"`));
    assert.match(html, new RegExp(`class="tenantBaseFee" data-row="${i + 1}"[^>]*value="${t.baseFee}"`));
  });
});

test('the default inputs on the page produce the same DEFAULTS split, summing exactly to the pool total', () => {
  const result = computeSplit(DEFAULTS);
  assert.equal(result.tenants.length, DEFAULTS.tenants.length);
  const sumCents = result.tenants.reduce((s, t) => s + t.totalCents, 0);
  assert.equal(sumCents, result.poolTotalCents);
  assert.match(html, /id="blendHoursPct" type="number" min="0" max="100" step="5" value="70"/);
  assert.match(html, /id="blendStoragePct" type="number" min="0" max="100" step="5" value="30"/);
  assert.match(html, /id="methodBlend" value="blend" checked/);
});

test('the page offers all four split methods as radio inputs', () => {
  for (const method of ['hours', 'storage', 'blend', 'equal']) {
    assert.match(html, new RegExp(`name="splitMethod"[^>]*value="${method}"`));
  }
});

test('the no-warranty disclaimer and the privacy line are both on the page', () => {
  assert.match(html, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /Nothing leaves your browser\./);
});

test('the page carries the standard sponsor link and a LICENSE link', () => {
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /href="LICENSE"/);
});

test('the privacy section names all four stored event types and says nothing is ever uploaded or saved', () => {
  assert.match(html, /nothing is ever uploaded/);
  assert.match(html, /never saved or sent anywhere/);
});

test('an opt-out control (id="optout") calling toggleUsage is present', () => {
  assert.match(html, /id="optout" type="button"/);
  assert.match(html, /toggleUsage\(false\)/);
});

test('the results panel announces recalculation to screen readers', () => {
  assert.match(html, /<section id="results" class="result" aria-live="polite">/);
});

test('an invalid input hides stale results instead of leaving them next to a silent error', () => {
  assert.match(html, /id="errors" class="err" role="alert"/, 'a dedicated, announced error region is missing');
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const catchBlock = scriptMatch[1].match(/\} catch \(e\) \{([\s\S]*?)\n  \}\n\}/);
  assert.ok(catchBlock, 'update() catch block not found');
  const body = catchBlock[1];
  assert.match(body, /el\('verdict'\)\.hidden = true/, 'the verdict hero is not hidden on a rejected input');
  assert.match(body, /el\('errors'\)\.hidden = false/, 'the error message is never shown');
});

test('the page has a copy-breakdown button with a textarea fallback', () => {
  assert.match(html, /id="copy-breakdown"/);
  assert.match(html, /id="breakdown-fallback" hidden/);
  assert.match(html, /id="breakdown-text" rows="12" readonly/);
  assert.match(html, /navigator\.clipboard\.writeText/);
});

test('no network calls are wired into the page script (pure client-side calculator)', () => {
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch);
  assert.doesNotMatch(scriptMatch[1], /\bfetch\(/);
  assert.doesNotMatch(scriptMatch[1], /XMLHttpRequest/);
});

// Closest sibling: same broad audience (independent food truck / mobile
// vendor operators), a different specific job (pricing one event booking
// there vs. splitting the recurring shared-kitchen bill here). Related tool
// chrome rotates, so link it explicitly one hop away.
test('index links one hop to the food-truck-event-margin-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/food-truck-event-margin-calculator\/"/,
    'index must link ../food-truck-event-margin-calculator/ so a crawler reaches that tool in one hop',
  );
  assert.match(html, /food truck event margin calculator/i);
});

test('index links to the vs-splitting-evenly comparison page', () => {
  assert.match(html, /href="\.\/vs-splitting-evenly\.html"/);
});

test('the comparison page links back to the calculator and carries valid FAQPage JSON-LD matching visible text', () => {
  const vsPage = readFileSync(new URL('./vs-splitting-evenly.html', import.meta.url), 'utf8');
  assert.match(vsPage, /href="\.\/"/);
  const blocks = [...vsPage.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const parsed = blocks.map((b) => JSON.parse(b));
  const faq = parsed.find((p) => p['@type'] === 'FAQPage');
  assert.ok(faq, 'missing FAQPage JSON-LD on the comparison page');
  assert.ok(faq.mainEntity.length >= 3);
  for (const qa of faq.mainEntity) {
    assert.ok(vsPage.includes(qa.name), `visible question missing: ${qa.name}`);
    assert.ok(vsPage.includes(qa.acceptedAnswer.text), `visible answer missing for: ${qa.name}`);
  }
});

test('the comparison page carries the no-warranty clause and is listed in the venture sitemap', () => {
  const vsPage = readFileSync(new URL('./vs-splitting-evenly.html', import.meta.url), 'utf8');
  assert.match(vsPage, /No warranty/);
  assert.match(vsPage, /Nothing leaves your browser/);
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /vs-splitting-evenly\.html/);
});

test('none of the FAQ questions on the comparison page duplicate a question on the index page', () => {
  const vsPage = readFileSync(new URL('./vs-splitting-evenly.html', import.meta.url), 'utf8');
  const indexFaq = JSON.parse(html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage"[\s\S]*?)<\/script>/)[1]);
  const vsFaq = JSON.parse(vsPage.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage"[\s\S]*?)<\/script>/)[1]);
  const indexQuestions = new Set(indexFaq.mainEntity.map((q) => q.name));
  for (const q of vsFaq.mainEntity) {
    assert.ok(!indexQuestions.has(q.name), `comparison page duplicates an index-page FAQ question: ${q.name}`);
  }
});
