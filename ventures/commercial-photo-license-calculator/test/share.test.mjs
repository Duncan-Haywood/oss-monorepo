import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { encodeShare, decodeShare } from '../share.mjs';

const docsPage = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

const FULL_INPUT = {
  currency: 'GBP',
  creative: '1200',
  images: '5',
  term: '12',
  territory: '1.6',
  exclusivity: '1.75',
  rush: '25',
  client: 'Northstar Coffee',
  photographer: 'Jamie Rivera',
  channels: ['web', 'outdoor'],
};

test('round-trips every field through a share link', () => {
  const decoded = decodeShare(encodeShare(FULL_INPUT));
  assert.equal(decoded.currency, 'GBP');
  assert.equal(decoded.creative, 1200);
  assert.equal(decoded.images, 5);
  assert.equal(decoded.term, 12);
  assert.equal(decoded.territory, 1.6);
  assert.equal(decoded.exclusivity, 1.75);
  assert.equal(decoded.rush, 25);
  assert.equal(decoded.client, 'Northstar Coffee');
  assert.equal(decoded.photographer, 'Jamie Rivera');
  assert.deepEqual(decoded.channels, ['web', 'outdoor']);
});

test('accepts a leading "#" the same as a bare fragment', () => {
  const hash = encodeShare(FULL_INPUT);
  assert.deepEqual(decodeShare(`#${hash}`), decodeShare(hash));
});

test('drops an unknown currency, term, territory, or exclusivity rather than passing it through', () => {
  const decoded = decodeShare(encodeShare({
    ...FULL_INPUT,
    currency: 'XYZ',
    term: 7,
    territory: 2,
    exclusivity: 0.5,
  }));
  assert.equal('currency' in decoded, false);
  assert.equal('term' in decoded, false);
  assert.equal('territory' in decoded, false);
  assert.equal('exclusivity' in decoded, false);
  // The fields that did validate still come through.
  assert.equal(decoded.creative, 1200);
});

test('drops an unknown channel name rather than smuggling it into the form', () => {
  const decoded = decodeShare(encodeShare({ ...FULL_INPUT, channels: ['web', 'drone', 'outdoor'] }));
  assert.deepEqual(decoded.channels, ['web', 'outdoor']);
});

test('de-duplicates repeated channels and caps at four', () => {
  const decoded = decodeShare(encodeShare({
    channels: ['web', 'web', 'paid', 'print', 'outdoor', 'web'],
  }));
  assert.deepEqual(decoded.channels, ['web', 'paid', 'print', 'outdoor']);
});

test('a negative creative fee or sub-one image count is dropped, not carried through as-is', () => {
  const decoded = decodeShare(encodeShare({ ...FULL_INPUT, creative: -100, images: 0 }));
  assert.equal('creative' in decoded, false);
  assert.equal('images' in decoded, false);
});

test('a rush premium outside 0-100 is dropped', () => {
  const decoded = decodeShare(encodeShare({ ...FULL_INPUT, rush: 150 }));
  assert.equal('rush' in decoded, false);
});

test('client and photographer names are truncated to 80 characters', () => {
  const long = 'x'.repeat(200);
  const decoded = decodeShare(encodeShare({ client: long, photographer: long }));
  assert.equal(decoded.client.length, 80);
  assert.equal(decoded.photographer.length, 80);
});

test('returns null for garbage input rather than throwing', () => {
  assert.equal(decodeShare(''), null);
  assert.equal(decodeShare(null), null);
  assert.equal(decodeShare('not json'), null);
  assert.equal(decodeShare(encodeURIComponent(JSON.stringify([1, 2, 3]))), null);
  assert.equal(decodeShare(encodeURIComponent(JSON.stringify({ unrelated: 'field' }))), null);
});

test('an empty or all-invalid payload decodes to null', () => {
  assert.equal(decodeShare(encodeShare({})), null);
  assert.equal(decodeShare(encodeShare({ currency: 'XYZ', channels: ['drone'] })), null);
});

test('the share button and status region exist on the page', () => {
  const html = docsPage('index.html');
  assert.match(html, /id="copy-share"/);
  assert.match(html, /id="share-status"/);
});

test('app.mjs wires the button to the share module, and a share link outranks a saved draft', () => {
  const app = docsPage('app.mjs');
  assert.match(app, /from '\.\/share\.mjs'/);
  assert.match(app, /decodeShare\(location\.hash\)/);
  assert.match(app, /if \(shared\) applyValues\(shared\);\s*\n\s*else restoreDraft\(\);/);
  assert.match(app, /\$\('copy-share'\)/);
});
