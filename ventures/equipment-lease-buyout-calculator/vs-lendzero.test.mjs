import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const page = readFileSync(new URL('./vs-lendzero.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the calculator links to its Lendzero comparison page and is listed in the sitemap', () => {
  assert.match(index, /vs-lendzero\.html/);
  assert.match(sitemap, /vs-lendzero\.html/);
});

test('the vs-Lendzero comparison page names what each tool is for, disclaims affiliation, and carries the standard disclaimer', () => {
  assert.match(page, /<title>This calculator vs\. Lendzero/);
  assert.match(page, /name="description"/);
  assert.match(page, /"@type":"FAQPage"/);
  assert.match(page, /href="\.\/"/);
  assert.match(page, /lendzero\.com/);
  assert.match(page, /rel="nofollow noopener"/);
  assert.match(page, /not affiliated with, endorsed by, or sponsored by Lendzero/i);
  // No dollar figure or price is asserted for Lendzero anywhere on this page:
  // its own pricing could not be verified against a primary source reachable
  // from this environment (lendzero.com is blocked by the egress proxy here),
  // so the comparison stays functional (what job each tool does) rather than
  // citing a number this repo cannot confirm -- same discipline as
  // freelance-retainer-calculator/vs-bonsai.html.
  assert.doesNotMatch(page, /Lendzero[^.]*\$\d/);
  assert.doesNotMatch(page, /\$\d[\d,]*(\.\d+)?\s*(\/|per)\s*(year|yr|month|mo)/i);
  assert.match(page, /Best-effort hosting, no SLA/);
  assert.match(page, /No warranty/);
  assert.match(page, /GitHub Sponsors/);
});

test('the vs-Lendzero page never claims a network call, matching every other page on this static site', () => {
  assert.doesNotMatch(page, /fetch\(|XMLHttpRequest|<script src=/);
});
