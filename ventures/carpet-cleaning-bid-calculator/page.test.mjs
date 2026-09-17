import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(root, 'index.html'), 'utf8');
const howTo = readFileSync(join(root, 'how-to-price-carpet-cleaning.html'), 'utf8');
const robots = readFileSync(join(root, 'robots.txt'), 'utf8');
const sitemap = readFileSync(join(root, 'sitemap.xml'), 'utf8');

test('landing page names the search problem and the hidden labor', () => {
  assert.match(html, /<title>[^<]*Carpet cleaning/i);
  assert.match(html, /meta name="description"[^>]+carpet cleaning/i);
  assert.match(html, /3.bed|per-room special|stairs/i);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /SoftwareApplication/);
});

test('the user-visible surface carries the disclaimer and a privacy line', () => {
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, financial, or business advice/);
  assert.match(html, /Nothing leaves your browser|never uploaded/i);
  assert.match(html, /usageOptOut/);
});

test('primary controls a technician can complete a bid with are present', () => {
  assert.match(html, /id="rooms"/);
  assert.match(html, /id="upholstery"/);
  assert.match(html, /id="stairFlights"/);
  assert.match(html, /id="travelMinutes"/);
  assert.match(html, /id="minimumCharge"/);
  assert.match(html, /id="proposedPrice"/);
  assert.match(html, /id="copySummary"/);
  assert.match(html, /how-to-price-carpet-cleaning\.html/);
});

test('a room\'s soil select reads back as "Custom rate", not a specific preset, when the rate matches none', () => {
  // A shared link always carries the real number (room.productionRate,
  // via share.mjs) correctly -- this is about the "Soil / extraction rate"
  // select's own label, which is a display convenience computed from that
  // number. Snapping an unmatched rate to a fixed preset index silently
  // relabels a custom (e.g. heavily soiled) room as "Normal household soil"
  // on whichever screen re-renders it -- the recipient's, or the sender's
  // own after a page reload -- which is the same "plausible, different
  // answer" risk platform/pages/roundtrip.mjs exists to catch, applied here
  // to a label rather than the carried value itself.
  assert.match(html, /<option value="custom">Custom rate<\/option>/);
  assert.doesNotMatch(html, /\|\|\s*SOIL_PRESETS\[1\]/,
    'an unmatched rate must read back as "custom", not silently snap to a fixed preset index');
});

test('how-to page answers the niche question and links back to the tool', () => {
  assert.match(howTo, /How to price carpet cleaning/i);
  assert.match(howTo, /FAQPage/);
  assert.match(howTo, /href="\.\/"/);
  assert.match(howTo, /No warranty/);
});

test('discoverability files let crawlers find both pages', () => {
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /carpet-cleaning-bid-calculator\/<\/loc>/);
  assert.match(sitemap, /how-to-price-carpet-cleaning\.html/);
});

// Closest sibling: same cleaning subcategory, but chemical cost rather than a
// carpet stop. Without a crawlable link here, a crawler entering on the carpet
// calculator never reaches the dilution tool in one hop — same one-way orphan
// class as #3709 / #3729 / #3743.
test('index links one hop to the cleaning-dilution-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/cleaning-dilution-calculator\/"/,
    'index must link ../cleaning-dilution-calculator/ so crawlers reach the dilution calculator in one hop',
  );
});
