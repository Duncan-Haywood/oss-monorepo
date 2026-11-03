import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, normalize, PRESETS } from './model.mjs';
import { estimate } from './estimate.mjs';
import { buildInstructions } from './instructions.mjs';
import { buildPackHtml, safeColor, safeLogo } from './buildpack.mjs';
import { buyLink, cleanKey, interpret, checkLicence } from './licence.mjs';
import { CHECKOUT_URL } from './checkout.mjs';

const shed = buildShed(normalize(PRESETS['8x12']()));
const est = estimate(shed);
const sections = buildInstructions(shed, est);
const E = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

test('pack carries the letterhead, every elevation, the shopping list and the steps', () => {
  const h = buildPackHtml(shed, est, sections, { business: 'Oak & Pine Sheds', customer: 'J. Smith', contact: 'call 555-0100', accent: '#aa3300', date: '2026-11-02' });
  assert.match(h, /Oak &amp; Pine Sheds/);
  assert.match(h, /J\. Smith/);
  for (const v of ['Front', 'Back', 'Left', 'Right']) assert.match(h, new RegExp(`${v} elevation`));
  assert.ok((h.match(/<svg/g) || []).length >= 5);
  for (const r of est.shopping) assert.ok(h.includes(E(r.name)), r.name);
  for (const s of sections) assert.ok(h.includes(E(s.title)), s.title);
  assert.match(h, /--a:#aa3300/);
  assert.match(h, /No warranty/);
});

test('typed text is escaped and a script cannot ride in on the logo or colour', () => {
  const h = buildPackHtml(shed, est, sections, { business: '<script>alert(1)</script>', notes: '<img onerror=x>', logo: 'data:image/svg+xml;base64,AAAA', accent: 'red;}</style><script>' });
  assert.ok(!h.includes('<script>alert'));
  assert.ok(!h.includes('<img onerror'));
  assert.equal(safeLogo('data:image/svg+xml;base64,AAAA'), '');
  assert.equal(safeColor('red;}'), '#24392b');
  assert.match(safeLogo('data:image/png;base64,iVBOR='), /^data:image\/png/);
});

test('prices can be left off, so a seller shows quantities only', () => {
  const h = buildPackHtml(shed, est, sections, { showPrices: false });
  assert.ok(!/Materials total/.test(h));
  assert.ok(!/<th>Each<\/th>/.test(h));
  assert.match(buildPackHtml(shed, est, sections, {}), /Materials total/);
});

test('licence: dark by default, only an explicit valid live key unlocks, offline never throws', async () => {
  assert.equal(buyLink(CHECKOUT_URL), CHECKOUT_URL || null); // dark when empty, live when golive.py set a link
  assert.equal(cleanKey('short'), null);
  assert.equal(interpret({ valid: true, license_key: { status: 'active' } }).valid, true);
  assert.equal(interpret({ valid: true, license_key: { status: 'disabled' } }).valid, false);
  assert.equal(interpret(null).valid, false);
  const off = await checkLicence('ABCD-1234-EFGH', { url: 'https://example.com/v', fetch: async () => { throw new Error('offline'); } });
  assert.equal(off.valid, false);
  const ok = await checkLicence('ABCD-1234-EFGH', { url: 'https://example.com/v', fetch: async () => ({ json: async () => ({ valid: true, license_key: { status: 'active' } }) }) });
  assert.equal(ok.valid, true);
});
