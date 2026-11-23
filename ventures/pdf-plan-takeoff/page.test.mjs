import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

test('index page carries the disclaimer and says nothing is uploaded', () => {
  const html = page('index.html');
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, construction, engineering, estimating or professional advice/);
  assert.match(html, /never leaves your browser/);
});

test('the page and the modules it loads never send the drawing anywhere', () => {
  for (const f of ['index.html', 'geometry.mjs', 'scale.mjs', 'measure.mjs', 'rooms.mjs', 'pdf-text.mjs', 'pdf-parser.mjs', 'inflate-browser.mjs', 'usage.mjs', 'sample.mjs']) {
    assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|https?:\/\/[^"'\s]*\.(m?js)\b/, f);
  }
});

test('every id the script reads exists in the markup', () => {
  const html = page('index.html');
  const script = /<script type="module">([\s\S]*?)<\/script>/.exec(html)[1];
  for (const m of script.matchAll(/\$\("#(\w+)"\)/g)) assert.match(html, new RegExp(`id="${m[1]}"`), m[1]);
});

test('accuracy numbers on the page match the README', () => {
  const html = page('index.html'), readme = page('README.md');
  for (const n of ['397', '142', '1,385', '43 of the 44', '5 of 298']) { assert.ok(html.includes(n), n); assert.ok(readme.includes(n), n); }
});

test('records the usage events the VENTURE.yaml hypothesis reads', () => {
  const html = page('index.html'), y = page('VENTURE.yaml');
  for (const ev of ['pdf_read', 'csv_downloaded', 'half_size_found']) { assert.ok(html.includes(`"${ev}"`), ev); assert.ok(y.includes(ev), ev); }
});
