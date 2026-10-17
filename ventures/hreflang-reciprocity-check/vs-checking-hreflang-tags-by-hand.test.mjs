import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildReport } from './engine.mjs';

const PAGE = 'vs-checking-hreflang-tags-by-hand.html';

async function read(file) {
  return readFile(new URL(`./${file}`, import.meta.url), 'utf8');
}

function jsonLd(html) {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(m, 'no JSON-LD block found');
  return JSON.parse(m[1]);
}

test('the page is valid JSON-LD FAQPage markup', async () => {
  const html = await read(PAGE);
  const ld = jsonLd(html);
  assert.equal(ld['@type'], 'FAQPage');
  assert.ok(ld.mainEntity.length >= 4);
});

test('every FAQPage answer is verbatim on the visible page, excluding the JSON-LD block itself', async () => {
  const html = await read(PAGE);
  const scriptEnd = html.indexOf('</script>');
  const visible = html.slice(scriptEnd);
  const ld = jsonLd(html);
  for (const qa of ld.mainEntity) {
    assert.ok(
      visible.includes(qa.acceptedAnswer.text),
      `answer not found verbatim in the visible page for "${qa.name}"`,
    );
  }
});

test('carries the required disclaimers and links back to the tool', () => {
  return read(PAGE).then((html) => {
    assert.match(html, /No warranty/);
    assert.match(html, /href="\.\/"/);
  });
});

test('names no vendor or competing product, so it needs no trademark-affiliation clause', async () => {
  const html = await read(PAGE);
  assert.ok(!/\btrademark/i.test(html));
  assert.ok(!/\bMerkle\b/i.test(html));
});

test('frames the difference as a limitation, never as a fault', async () => {
  const html = await read(PAGE);
  assert.match(html, /Nothing here says or implies that checking hreflang tags by hand is a bad practice/);
  for (const word of ['scam', 'useless', 'lazy', 'incompetent']) {
    assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(html), `the page uses "${word}"`);
  }
});

test('is linked from index.html, README.md, and the sitemap', async () => {
  const [index, readme, sitemap] = await Promise.all([
    read('index.html'),
    read('README.md'),
    read('sitemap.xml'),
  ]);
  assert.match(index, /vs-checking-hreflang-tags-by-hand\.html/);
  assert.match(readme, /vs-checking-hreflang-tags-by-hand\.html/);
  assert.match(sitemap, /vs-checking-hreflang-tags-by-hand\.html/);
});

test('the worked-example findings match buildReport() exactly, not invented figures', async () => {
  const html = await read(PAGE);

  function page(links) {
    return `<!doctype html><html><head>${links
      .map((l) => `<link rel="alternate" hreflang="${l.hreflang}" href="${l.href}">`)
      .join('')}</head><body></body></html>`;
  }

  const en = 'https://example.com/en/';
  const enUk = 'https://example.com/en-uk/';
  const fr = 'https://example.com/fr/';
  const es = 'https://example.com/es/';
  const enLinks = [
    { hreflang: 'en', href: en },
    { hreflang: 'en-uk', href: enUk },
    { hreflang: 'fr', href: fr },
    { hreflang: 'es', href: es },
  ];
  const report = buildReport({
    url: en,
    html: page(enLinks),
    alternates: [
      { href: enUk, html: page(enLinks) },
      { href: fr, html: page(enLinks) },
      // the es page never links back to en -- the planted reciprocity break
      { href: es, html: page([{ hreflang: 'es', href: es }, { hreflang: 'fr', href: fr }]) },
    ],
  });

  assert.equal(report.dangerCount, 2);
  assert.equal(report.noticeCount, 1);
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((f) => f.id === 'invalid-hreflang-code' && f.hreflang === 'en-uk'));
  assert.ok(report.findings.some((f) => f.id === 'missing-reciprocal-confirmation' && f.href === es));
  assert.ok(report.findings.some((f) => f.id === 'missing-x-default'));

  assert.match(html, /2 danger-level findings, 1 notice/);
  assert.match(html, /en-uk/);
  assert.match(html, /the real one is "GB"/);
});
