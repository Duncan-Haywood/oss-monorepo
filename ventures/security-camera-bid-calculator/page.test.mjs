import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INPUT_FIELDS, RESOLUTIONS, CODECS, CONSTRUCTION_TYPES } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const readme = readFileSync(new URL('./README.md', import.meta.url), 'utf8');
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const script = /<script type="module">([\s\S]*?)<\/script>/.exec(html)[1];

test('the landing page names the search phrase and refuses an engineering opinion', () => {
  assert.match(html, /Security Camera Installation Bid Calculator/);
  assert.match(html, /How Much to Charge to Install CCTV/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /FAQPage/);
  assert.match(html, /SoftwareApplication/);
  assert.match(html, /not electrical, engineering, code, security, privacy, legal/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /Nothing leaves your browser/);
  assert.match(html, /usageOptOut/);
  assert.match(html, /Do not keep anonymous local usage counts/);
});

test('the page wires the calculator and usage modules', () => {
  assert.match(script, /from '\.\/calc\.mjs'/);
  assert.match(script, /from '\.\/usage\.mjs'/);
  assert.match(script, /recordUsage\(/);
  assert.match(script, /calculateBid\(/);
});

test('every input field the calculator declares exists on the form', () => {
  // The recorded defect this guards: a calculator grows a field, the page that
  // feeds it does not, and the tool silently prices a different job than the
  // one on screen.
  for (const field of INPUT_FIELDS) {
    assert.ok(ids.has(field), `index.html is missing an input for ${field}`);
  }
});

test('the form has no input the calculator does not read', () => {
  // The other direction: a control a visitor can change that reaches nothing.
  const declared = new Set(INPUT_FIELDS);
  const chrome = new Set(['usageOptOut', 'error', 'checks']);
  // The customer proposal's own fields — the business's name, the client's
  // address, the deposit split — are inputs the *calculator* rightly does not
  // read, and they are generated into this page by
  // `platform/proposal/adopt.mjs`. Excluded by their generated region rather
  // than by a hand-written list, so a field added to the shared proposal does
  // not fail this venture's test for a defect it does not have. Everything
  // outside the markers is still held to the rule.
  const outsideProposal = html.replace(
    /<!-- proposal:begin[\s\S]*?<!-- proposal:end -->/g,
    '',
  );
  const formIds = [...outsideProposal.matchAll(/<(?:input|select)[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
  for (const id of formIds) {
    assert.ok(declared.has(id) || chrome.has(id), `${id} is on the form but not in INPUT_FIELDS`);
  }
});

test('every result the page displays is a field the calculator returns', () => {
  for (const id of [
    'bidPrice', 'costFloor', 'pricePerCamera', 'labourHours', 'loadedHourlyRate',
    'labourCost', 'materialCost', 'totalCableFeet', 'overheadCost',
    'terabytesPerDay', 'terabytesRequired', 'actualRetentionDays', 'poeLoad',
    'proposedMarginPercent',
  ]) {
    assert.ok(ids.has(id), `result slot ${id} is missing`);
    assert.ok(script.includes(`el('${id}')`), `${id} is never written by the script`);
  }
});

test('the three engineering checks are surfaced, not buried in the cost breakdown', () => {
  assert.match(html, /Storage for quoted days/);
  assert.match(html, /Days these drives hold/);
  assert.match(html, /PoE load/);
  assert.match(script, /result\.warnings/);
  assert.match(html, /id="checks"/);
});

test('warning text is written as text, never as markup', () => {
  // Warnings interpolate numbers taken from the form. Writing them through
  // innerHTML would make a form value into markup.
  assert.match(script, /li\.textContent = w/);
  assert.ok(!/innerHTML\s*=\s*w\b/.test(script), 'a warning must never go through innerHTML');
});

test('the preset dropdowns are populated from the calculator, not retyped in markup', () => {
  // A preset list that drifted from the arithmetic would be a bug neither
  // file's own tests could see.
  for (const name of ['RESOLUTIONS', 'CODECS', 'CONSTRUCTION_TYPES', 'DRIVE_SIZES_TB']) {
    assert.ok(script.includes(name), `${name} should populate its <select>`);
  }
  assert.ok(RESOLUTIONS.length >= 4 && CODECS.length >= 3 && CONSTRUCTION_TYPES.length >= 4);
  // The markup must not hardcode the options the script adds.
  const resolutionSelect = /<select id="resolution">([\s\S]*?)<\/select>/.exec(html)[1];
  assert.equal(resolutionSelect.trim(), '', 'resolution options come from RESOLUTIONS');
});

test('a bad entry explains itself instead of blanking the page', () => {
  assert.match(html, /id="error"/);
  assert.match(script, /catch \(e\)/);
  assert.match(script, /e\.message/);
});

test('usage counting is debounced and honours the opt-out', () => {
  assert.match(script, /clearTimeout\(recordTimer\)/);
  assert.match(script, /usageOptOut'\)\.checked/);
});

test('the draft never breaks the page when storage is unavailable', () => {
  // Private-mode browsers throw on localStorage. The calculator must still run.
  const saves = [...script.matchAll(/localStorage\.(?:setItem|getItem)/g)];
  assert.ok(saves.length >= 2, 'the draft uses localStorage');
  assert.ok(/catch \{ \/\* ignore \*\/ \}/.test(script), 'and every use is guarded');
});

test('the README carries the same disclaimer and the privacy line', () => {
  // Prose wraps; the clause is one sentence regardless of where the line broke.
  const flat = readme.replace(/\s+/g, ' ');
  assert.match(flat, /not electrical, engineering, code, security, privacy, legal/);
  assert.match(flat, /Nothing is uploaded/);
  assert.match(flat, /security-camera-bid-usage/);
  assert.match(flat, /No warranty/);
  assert.match(flat, /Best-effort hosting, no SLA/);
});

test('the disclaimer in the README and the one on the page are the same clause', () => {
  // A disclaimer that drifts between the two is the one a reader can argue with.
  const clause = 'It is not electrical, engineering, code, security, privacy, legal, tax, or contracting advice';
  assert.ok(readme.replace(/\s+/g, ' ').includes(clause), 'README carries the clause');
  assert.ok(html.replace(/\s+/g, ' ').includes(clause), 'the page carries the same clause');
});

test('the page is responsive rather than a desktop-only grid', () => {
  assert.match(html, /@media \(max-width: 820px\)/);
  assert.match(html, /width=device-width/);
});

test('the "how much to charge" SEO page exists, is linked from the calculator, and is in the sitemap', () => {
  assert.match(html, /how-much-to-charge\.html/, 'index.html does not link to the companion SEO page');
  const doc = readFileSync(new URL('./how-much-to-charge.html', import.meta.url), 'utf8');
  assert.match(doc, /How much should I charge to install security cameras/i);
  assert.match(doc, /FAQPage/);
  assert.match(doc, /No warranty/);
  assert.match(doc, /href="\.\/"/, 'the SEO page has no link back to the calculator');
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /how-much-to-charge\.html/);
});
