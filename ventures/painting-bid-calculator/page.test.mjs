// Structural tests for index.html. calc.test.mjs never looks at the page, so
// it stays green when the page advertises a figure it does not render.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

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

const { markup, scripts, unclosed } = parse(html);
const scriptSource = scripts.join('\n');

test('every raw-text element is closed', () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test('the page names the painter problem before the form', () => {
  assert.match(markup, /Bid the surfaces, not the floor plan/i);
  assert.match(markup, /<title>[^<]*Painting Bid Calculator/i);
  assert.match(html, /meta name="description"/);
});

test('disclaimer and privacy line are visible, not only in the README', () => {
  assert.match(markup, /No warranty/i);
  assert.match(markup, /not legal, tax, financial/i);
  assert.match(markup, /Nothing leaves your browser/i);
  assert.match(markup, /usageOptOut/);
});

test('schema.org featureList figures are actually rendered', () => {
  const featureList = html.match(/"featureList":\s*"([^"]+)"/);
  assert.ok(featureList, 'no schema.org featureList found');

  const claims = [
    ['walk-away', /breakEven/],
    ['price per floor square foot', /perFloor/],
    ['effective hourly rate', /hourlyRate/],
    ['labor split', /split/],
    ['proposed-price', /proposedPrice|verdict/],
    ['common floor-square-foot bid', /commonBid|commonFloor/],
  ];

  for (const [claim, rendered] of claims) {
    assert.ok(
      featureList[1].toLowerCase().includes(claim.toLowerCase()),
      `featureList no longer advertises "${claim}"`,
    );
    assert.match(
      html,
      rendered,
      `featureList advertises "${claim}" but the page never mentions ${rendered}`,
    );
  }
});

test('null per-unit ratios are rendered defensively', () => {
  assert.match(scriptSource, /pricePerFloorSqFt === null/);
  assert.match(scriptSource, /pricePerPaintableSqFt === null/);
  assert.match(scriptSource, /effectiveHourlyRate === null/);
});

test('share and restore are wired without uploading inputs', () => {
  assert.match(scriptSource, /encodeState/);
  assert.match(scriptSource, /decodeState/);
  assert.match(scriptSource, /localStorage/);
  assert.match(markup, /Copy shareable link/);
});
