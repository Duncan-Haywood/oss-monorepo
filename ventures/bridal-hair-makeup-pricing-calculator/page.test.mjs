import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuote, DEFAULTS } from './calc.mjs';
import { FIELD_IDS } from './share.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const script = html.match(/<script type="module">([\s\S]*)<\/script>/)[1];

test('every DEFAULTS field has a matching input on the page', () => {
  for (const id of Object.keys(DEFAULTS)) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} input is missing from the page`);
  }
});

test('the page imports the arithmetic and the field list rather than restating either', () => {
  assert.match(html, /import \{ calculateQuote \} from '\.\/calc\.mjs'/);
  assert.match(
    html,
    /import \{ encodeInputs, decodeInputs, hasSharedInputs, formValues, FIELD_IDS \} from '\.\/share\.mjs'/,
  );
  assert.deepEqual([...FIELD_IDS], Object.keys(DEFAULTS));
});

test('every input the page shows is one a shared link carries', () => {
  for (const id of FIELD_IDS) {
    assert.ok(ids.has(id), `#${id} is on share.mjs's field list but missing from the page`);
  }
});

test('every default value on the page matches calc.mjs DEFAULTS', () => {
  for (const [id, value] of Object.entries(DEFAULTS)) {
    const input = html.match(new RegExp(`id="${id}"[^>]*value="([^"]*)"`));
    assert.ok(input, `#${id} has no value attribute`);
    assert.equal(
      Number(input[1]),
      value,
      `#${id} on the page is ${input[1]} but calc.mjs defaults to ${value}`,
    );
  }
});

test('the page wires usage counting for both the calculation and the assistant-needed finding', () => {
  assert.match(script, /recordEvent\('booking-priced'\)/);
  assert.match(script, /recordEvent\('assistant-needed'\)/);
  assert.match(html, /<code>booking-priced<\/code>, <code>assistant-needed<\/code>/);
});

test('the result panel announces recalculation to screen readers', () => {
  assert.match(html, /<section class="result" aria-live="polite">/);
});

test('every input has a visible label wrapping it, so a screen reader announces a name', () => {
  for (const id of FIELD_IDS) {
    assert.match(
      html,
      new RegExp(`<label>[^<]+<input id="${id}"`),
      `#${id} is not inside a <label>, so it has no accessible name`,
    );
  }
});

test('an invalid input hides stale results instead of leaving them next to a silent error', () => {
  assert.match(html, /id="errors" class="err" role="alert"/, 'a dedicated, announced error region is missing');
  const catchBlock = script.match(/function update\([\s\S]*?catch \(e\) \{([\s\S]*?)\n  \}\n\}/);
  assert.ok(catchBlock, 'update() catch block not found');
  const body = catchBlock[1];
  assert.match(body, /el\('totalHero'\)\.hidden = true/, 'the total hero is not hidden on a rejected input');
  assert.match(body, /el\('errors'\)\.hidden = false/, 'the error message is never shown');
  assert.match(body, /for \(const id of OUT_IDS\) el\(id\)\.textContent = ''/, 'stale figures are left on screen');
});

test('every output element the success path writes is cleared on the error path', () => {
  const outIds = script.match(/const OUT_IDS = \[([\s\S]*?)\];/);
  assert.ok(outIds, 'OUT_IDS not found');
  const cleared = new Set([...outIds[1].matchAll(/'([^']+)'/g)].map(m => m[1]));
  const written = [...script.matchAll(/el\('(\w+Out|totalLine)'\)\.textContent =/g)].map(m => m[1]);
  for (const id of new Set(written)) {
    assert.ok(cleared.has(id), `#${id} is written on success but never cleared on error`);
  }
});

test('the findings each have their own banner, hidden by default', () => {
  assert.match(html, /id="capacityWarning" class="warn" hidden/);
  assert.match(html, /id="headcountWarning" class="warn" hidden/);
  assert.match(html, /id="minimumWarning" class="warn" hidden/);
  assert.match(html, /id="fitsVerdict" class="good" hidden/);
});

test('the default booking needs exactly one additional artist, the case the copy describes', () => {
  const r = calculateQuote(DEFAULTS);
  assert.equal(r.additionalArtistsNeeded, 1);
  assert.equal(r.belowRevenueMinimum, false);
  assert.equal(r.belowHeadcountMinimum, false);
});

test('the no-warranty disclaimer is on the page', () => {
  assert.match(html, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(html, /not tax, financial, or business advice/);
});

test('the page carries the standard sponsor link and a LICENSE link, and counts a sponsor click', () => {
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /href="LICENSE"/);
  assert.match(script, /recordEvent\('sponsor_link_clicked'\)/);
});

test('the privacy line says nothing is uploaded or saved', () => {
  assert.match(html, /never uploaded/);
  assert.match(html, /nothing is saved when you close the tab/);
});

test('page wires a shareable link, matching sibling calculators', () => {
  for (const id of ['copyLink', 'shareStatus']) {
    assert.ok(ids.has(id), `missing #${id}`);
  }
  assert.match(script, /el\('copyLink'\)\.addEventListener\('click'/);
  assert.match(script, /recordEvent\('link_copied'\)/);
  assert.match(html, /<code>link_copied<\/code>/);
});

test('the shared booking rides in the fragment, never the query string', () => {
  assert.match(script, /\$\{query \? `#\$\{query\}` : ''\}/);
});

test('a shared link replaces every field, so none of the recipient own numbers survive', () => {
  assert.match(script, /formValues\(fromLink\)/);
  assert.doesNotMatch(
    script,
    /Object\.entries\(fromLink\)/,
    'writing the decoded link straight onto the form would leave the recipient\'s own values in the fields it omitted',
  );
});

test('opening the page on a shared link says so, without counting it as a calculation', () => {
  assert.match(script, /hasSharedInputs\(fromLink\)/);
  assert.match(script, /Opened a shared booking/);
  const restoreBlock = script.match(/const fromLink[\s\S]*?\n\}/);
  assert.ok(restoreBlock, 'the restore-from-link block was not found');
  assert.doesNotMatch(restoreBlock[0], /recordEvent\(/, 'opening a shared link is not a calculation');
});

test('the FAQ answer about uploads names the share control honestly', () => {
  assert.match(html, /Copy shareable link button puts the figures on the form into the page.s URL fragment/);
  assert.match(html, /Anyone who has that link can read the numbers in it/);
});

test('every .html file in the venture is reachable from the sitemap', () => {
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  for (const file of ['index.html', 'vs-flat-day-rate.html']) {
    const loc = file === 'index.html'
      ? '/bridal-hair-makeup-pricing-calculator/'
      : `/bridal-hair-makeup-pricing-calculator/${file}`;
    assert.ok(sitemap.includes(loc), `${file} is not listed in sitemap.xml`);
  }
});

test('index links its own comparison page', () => {
  assert.match(html, /href="\.\/vs-flat-day-rate\.html"/);
});

test('index links the appointment-deposit-calculator sibling for trial/booking deposits', () => {
  assert.match(html, /href="\.\.\/appointment-deposit-calculator\/"/);
});

test('every visible FAQ heading appears in the FAQPage structured data', () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map(m => JSON.parse(m[1]));
  const faq = blocks.find(b => b['@type'] === 'FAQPage');
  assert.ok(faq, 'the page carries no FAQPage structured data');
  const questions = faq.mainEntity.map(q => q.name);
  const headings = [...html.matchAll(/<h3>([^<]+)<\/h3>/g)].map(m => m[1]);
  for (const heading of headings) {
    const decoded = heading.replace(/&hellip;/g, '…').replace(/&amp;/g, '&');
    assert.ok(
      questions.some(q => q === decoded),
      `visible FAQ heading "${decoded}" is missing from the FAQPage JSON-LD`,
    );
  }
  assert.equal(questions.length, headings.length, 'the JSON-LD and the visible FAQ list different questions');
});
