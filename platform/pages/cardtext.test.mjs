// Tests for the stroke font that draws a share card's headline.
//
// The failure this file is really guarding against is a silent one: a glyph
// table that stops producing ink still writes a valid PNG of the right size,
// and every link to it still resolves. So these assert on *pixels* — that the
// text is there, that it is inside the card, and that different text produces
// different ink — rather than on the shape of the data structures.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { GLYPHS, drawText, headlineFrom, layout, measure } from './cardtext.mjs';
import { renderSocialCard, SOCIAL_CARD_HEIGHT, SOCIAL_CARD_WIDTH } from './offline.mjs';

/** A blank RGBA target, plus a count of how many pixels the text touched. */
function surface(width = 400, height = 120) {
  return { width, height, rgba: Buffer.alloc(width * height * 4) };
}

const inked = (target) => {
  let n = 0;
  for (let i = 3; i < target.rgba.length; i += 4) if (target.rgba[i] > 0) n += 1;
  return n;
};

test('every glyph the titles use is in the table', () => {
  // The set observed across all 164 catalogue titles, plus the separators the
  // headline splitter has to survive. An unmapped character degrades to a
  // space rather than throwing, so without this the failure mode is a title
  // quietly missing a letter.
  for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 &,-./:?|—–'()%+!") {
    assert.ok(GLYPHS[ch], `no glyph for ${JSON.stringify(ch)}`);
    assert.ok(GLYPHS[ch].w > 0, `${JSON.stringify(ch)} has no advance width`);
  }
});

test('an unmapped character is a space, not a crash', () => {
  assert.doesNotThrow(() => measure('WIDGET ☃ PRICER'));
  const target = surface();
  assert.doesNotThrow(() => drawText(target, 'A ☃ B', { x: 10, y: 80, size: 40 }));
});

test('measure grows with the string and is zero for the empty one', () => {
  assert.equal(measure(''), 0);
  assert.ok(measure('WW') > measure('W'));
  assert.ok(measure('MMMM') > measure('IIII'), 'M should be wider than I');
});

test('drawText puts ink on the target', () => {
  const target = surface();
  drawText(target, 'DECK', { x: 20, y: 90, size: 48 });
  assert.ok(inked(target) > 500, 'the headline drew almost nothing');
});

test('drawText leaves the target alone for a string with no strokes', () => {
  const target = surface();
  drawText(target, '   ', { x: 20, y: 90, size: 48 });
  assert.equal(inked(target), 0);
});

test('different text draws different ink', () => {
  const a = surface();
  const b = surface();
  drawText(a, 'ALPHA', { x: 20, y: 90, size: 48 });
  drawText(b, 'OMEGA', { x: 20, y: 90, size: 48 });
  assert.ok(!a.rgba.equals(b.rgba));
});

test('drawText never writes outside the buffer', () => {
  // Deliberately off every edge. A stamp loop that forgot to clamp would
  // either throw here or wrap ink round to the opposite side of the card.
  const target = surface(80, 40);
  assert.doesNotThrow(() => {
    drawText(target, 'OVERFLOW', { x: -400, y: 20, size: 60 });
    drawText(target, 'OVERFLOW', { x: 400, y: 20, size: 60 });
    drawText(target, 'OVERFLOW', { x: 10, y: -50, size: 60 });
    drawText(target, 'OVERFLOW', { x: 10, y: 500, size: 60 });
  });
  assert.equal(target.rgba.length, 80 * 40 * 4);
});

test('centred text is centred', () => {
  const target = surface(400, 120);
  drawText(target, 'HI', { x: 200, y: 90, size: 48, align: 'center' });
  let minX = Infinity;
  let maxX = -Infinity;
  for (let y = 0; y < 120; y += 1) {
    for (let x = 0; x < 400; x += 1) {
      if (target.rgba[(y * 400 + x) * 4 + 3] > 0) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
    }
  }
  assert.ok(maxX > minX, 'nothing was drawn');
  assert.ok(Math.abs((minX + maxX) / 2 - 200) < 6, `centred at ${(minX + maxX) / 2}, not 200`);
});

test('layout fits the box it is given', () => {
  const maxWidth = 900;
  const maxHeight = 260;
  const { lines, size, lineHeight } = layout('QUARTZ AND GRANITE COUNTERTOP BID CALCULATOR', {
    maxWidth,
    maxHeight,
    maxLines: 3,
  });
  assert.ok(lines.length >= 1 && lines.length <= 3);
  for (const line of lines) {
    assert.ok(measure(line) * size <= maxWidth + 0.5, `"${line}" overflows the card`);
  }
  assert.ok(size + (lines.length - 1) * lineHeight <= maxHeight + 0.5, 'the block is taller than its band');
});

test('layout keeps every word', () => {
  const title = 'POOL PLASTER / RESURFACING BID CALCULATOR';
  const { lines } = layout(title, { maxWidth: 900, maxHeight: 260 });
  assert.equal(lines.join(' '), title, 'wrapping dropped or reordered a word');
});

test('a shorter title is set larger than a longer one', () => {
  const box = { maxWidth: 900, maxHeight: 260, maxLines: 3 };
  const short = layout('DECK BID CALCULATOR', box);
  const long = layout('DOORDASH FEE CALCULATOR FOR RESTAURANTS AND GHOST KITCHENS', box);
  assert.ok(short.size > long.size);
});

test('layout copes with a single unbreakable word and with nothing at all', () => {
  const box = { maxWidth: 300, maxHeight: 200, maxLines: 3 };
  const one = layout('SUPERCALIFRAGILISTIC', box);
  assert.equal(one.lines.length, 1);
  assert.ok(measure(one.lines[0]) * one.size <= 300 + 0.5);

  const none = layout('   ', box);
  assert.deepEqual(none.lines, []);
  assert.equal(none.size, 0);
});

test('headlineFrom keeps the name and drops the search tagline', () => {
  assert.equal(
    headlineFrom('DoorDash fee calculator for restaurants — compare delivery apps on one ticket'),
    'DOORDASH FEE CALCULATOR FOR RESTAURANTS',
  );
  assert.equal(headlineFrom('Shopify Fee Calculator | Payments vs PayPal'), 'SHOPIFY FEE CALCULATOR');
  assert.equal(headlineFrom('Deck Bid Calculator'), 'DECK BID CALCULATOR');
  // A hyphenated word is not a tagline separator: only a dash with spaces
  // around it is. "No-show" must survive.
  assert.equal(headlineFrom('No-Show & Cancellation Fee Calculator'), 'NO-SHOW & CANCELLATION FEE CALCULATOR');
  assert.equal(headlineFrom(''), '');
  assert.equal(headlineFrom(undefined), '');
});

test('a card with a headline is a valid PNG of the declared size, and differs from one without', () => {
  const plain = renderSocialCard('#12594a');
  const titled = renderSocialCard({
    color: '#12594a',
    headline: 'Deck Bid Calculator',
    kicker: 'Free small-business calculators',
    footer: 'Runs in your browser',
  });
  assert.ok(titled.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])));
  // IHDR width/height, big-endian, at the fixed offset a PNG header puts them.
  assert.equal(titled.readUInt32BE(16), SOCIAL_CARD_WIDTH);
  assert.equal(titled.readUInt32BE(20), SOCIAL_CARD_HEIGHT);
  assert.ok(!plain.equals(titled), 'the headline changed nothing on the card');
});

test('two tools with different names render different cards', () => {
  const one = renderSocialCard({ color: '#12594a', headline: 'Deck Bid Calculator' });
  const two = renderSocialCard({ color: '#12594a', headline: 'Fence Bid Calculator' });
  assert.ok(!one.equals(two));
});

test('renderSocialCard still accepts a bare colour, as its first callers passed', () => {
  assert.ok(renderSocialCard('#5c4412').equals(renderSocialCard({ color: '#5c4412' })));
  assert.ok(renderSocialCard().equals(renderSocialCard({})));
});

test('a card renders fast enough to draw one per tool on every pod start', () => {
  // The site is rebuilt inside the cluster on every pod start, under a 2-core
  // limit, and there are 164 of these. A regression that made a card cost half
  // a second would add a minute and a half to every restart.
  const started = Date.now();
  for (let i = 0; i < 5; i += 1) {
    renderSocialCard({
      color: '#12594a',
      headline: `Sample Tool Number ${i} Bid Calculator`,
      kicker: 'Free small-business calculators',
      footer: 'Runs in your browser · nothing you type is uploaded',
    });
  }
  const perCard = (Date.now() - started) / 5;
  assert.ok(perCard < 400, `a card took ${perCard}ms`);
});
