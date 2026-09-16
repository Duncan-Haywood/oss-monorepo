import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const DOCS_PAGE = 'why-security-txt-expires.html';
const VS_PAGE = 'vs-securitytxt-org-generator.html';
const ALL_PAGES = ['index.html', DOCS_PAGE, VS_PAGE];

function jsonLdBlocks(source) {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  const blocks = [];
  let m;
  while ((m = re.exec(source)) !== null) blocks.push(m[1]);
  return blocks;
}

async function read(file) {
  return readFile(new URL(`./${file}`, import.meta.url), 'utf8');
}

test('every JSON-LD block on the index page is valid JSON', async () => {
  const blocks = jsonLdBlocks(await read('index.html'));
  assert.ok(blocks.length >= 2, 'expected at least a SoftwareApplication and a FAQPage block');
  for (const block of blocks) {
    assert.doesNotThrow(() => JSON.parse(block), `invalid JSON in block: ${block.slice(0, 80)}...`);
  }
});

test('index JSON-LD includes a free-priced SoftwareApplication and a FAQPage', async () => {
  const parsed = jsonLdBlocks(await read('index.html')).map((b) => JSON.parse(b));
  const app = parsed.find((p) => p['@type'] === 'SoftwareApplication');
  const faq = parsed.find((p) => p['@type'] === 'FAQPage');
  assert.ok(app, 'missing SoftwareApplication JSON-LD');
  assert.equal(app.offers.price, '0');
  assert.ok(faq, 'missing FAQPage JSON-LD');
  assert.ok(faq.mainEntity.length >= 3);
});

test('the docs page carries valid FAQPage JSON-LD', async () => {
  const blocks = jsonLdBlocks(await read(DOCS_PAGE)).map((b) => JSON.parse(b));
  const faq = blocks.find((b) => b['@type'] === 'FAQPage');
  assert.ok(faq, 'missing FAQPage JSON-LD on the doc page');
  assert.ok(faq.mainEntity.length >= 3);
});

// A FAQPage block whose answers have drifted from the visible copy is the
// exact defect structured-data-drift-check exists to report, and this repo
// has shipped it before. Pin the two together here rather than trusting them
// to stay in sync by hand.
test('every FAQ answer in the JSON-LD also appears as visible copy', async () => {
  for (const file of ['index.html', DOCS_PAGE]) {
    const html = await read(file);
    const faq = jsonLdBlocks(html).map((b) => JSON.parse(b)).find((b) => b['@type'] === 'FAQPage');
    for (const entry of faq.mainEntity) {
      // Compare on a distinctive fragment: the markup wraps codes in tags, so
      // the full answer text never matches the HTML byte for byte.
      const needle = entry.acceptedAnswer.text.split(/[.—]/)[0].trim().slice(0, 40);
      // Strip the markup as well as the scripts: the visible copy wraps field
      // names in <code>, so the answer text never matches the HTML byte for
      // byte even when the two say exactly the same thing.
      const visible = html
        .replace(/<script[\s\S]*?<\/script>/g, '')
        .replace(/<[^>]*>/g, '');
      assert.ok(
        visible.includes(needle),
        `${file}: FAQ answer for ${JSON.stringify(entry.name)} has no visible counterpart (looked for ${JSON.stringify(needle)})`,
      );
    }
  }
});

test('the no-warranty disclaimer is present on all three pages', async () => {
  for (const file of ALL_PAGES) {
    const html = await read(file);
    assert.match(html, /No warranty/, `${file} is missing the no-warranty clause`);
    assert.match(html, /provided free and as-is, without warranty/, `${file} is missing the full clause text`);
  }
});

test('the privacy line states nothing is uploaded', async () => {
  const html = await read('index.html');
  assert.match(html, /never uploaded|never leaves your device/);
});

test('the sponsor link points at the correct GitHub Sponsors profile on all three pages', async () => {
  for (const file of ALL_PAGES) {
    const html = await read(file);
    assert.match(html, /https:\/\/github\.com\/sponsors\/Duncan-Haywood/, `${file} is missing the sponsor link`);
  }
});

test('the MIT license is linked from index', async () => {
  const html = await read('index.html');
  assert.match(html, /href="LICENSE"/);
  assert.match(html, /MIT licen[cs]e/);
});

test('a usage opt-out control exists', async () => {
  assert.match(await read('index.html'), /id="usageOptOut"/);
});

test('the "not a security assessment" disclaimer is present', async () => {
  const html = await read('index.html');
  assert.match(html, /not a security assessment/);
});

test('engine.mjs and usage.mjs are imported as ES modules, not duplicated inline', async () => {
  const html = await read('index.html');
  assert.match(html, /from '\.\/engine\.mjs'/);
  assert.match(html, /from '\.\/usage\.mjs'/);
});

test('index links to the docs page and the docs page links back', async () => {
  const index = await read('index.html');
  const docs = await read(DOCS_PAGE);
  assert.match(index, new RegExp(`href="${DOCS_PAGE.replace(/\./g, '\\.')}"`));
  assert.match(docs, /href="\.\/"/);
});

test('index links to the comparison page, which links back and names its non-affiliation', async () => {
  assert.match(await read('index.html'), new RegExp(`href="${VS_PAGE.replace(/\./g, '\\.')}"`));
  const vs = await read(VS_PAGE);
  assert.match(vs, /href="\.\/"/, 'must link back to the tool');
  assert.match(vs, /not affiliated with, endorsed by, or sponsored by securitytxt\.org/i, 'missing the non-affiliation disclaimer');
});

test('index links to at least one sibling checker venture', async () => {
  assert.match(
    await read('index.html'),
    /href="\.\.\/(security-headers-check|ai-crawler-access-check|email-auth-check)\/"/,
  );
});

test('a worked-example button exists as an alternative to pasting from scratch', async () => {
  assert.match(await read('index.html'), /id="load-example"/);
});

test('the page names RFC 9116 and the well-known path it validates against', async () => {
  const html = await read('index.html');
  assert.match(html, /RFC 9116/);
  assert.match(html, /\/\.well-known\/security\.txt/);
});

test('the page explains that a paste cannot show the served location or media type', async () => {
  assert.match(await read('index.html'), /cannot be seen from[\s\S]{0,40}pasted text/);
});

test('the worked example demonstrates an expired date and a bare-address Contact', async () => {
  const html = await read('index.html');
  assert.match(html, /Expires: 2025-06-01T00:00:00Z/, 'the example must contain an expired date');
  assert.match(html, /Contact: security@example\.com/, 'the example must contain a non-URI Contact');
});

test('the CLI file exists and the page documents it', async () => {
  assert.match(await read('index.html'), /node check\.mjs/);
});

// The example is the first thing most visitors run, so a change to the engine
// that stops it demonstrating anything would leave the page quietly selling a
// checker that finds nothing. Pin the example against the real engine.
test('the worked example actually produces the findings the status line promises', async () => {
  const html = await read('index.html');
  const { buildReport } = await import('./engine.mjs');
  const example = /const EXAMPLE = \[([\s\S]*?)\]\.join\('\\n'\);/.exec(html);
  assert.ok(example, 'could not find the EXAMPLE literal in index.html');
  const text = example[1]
    .split('\n')
    .map((l) => l.trim().replace(/,$/, ''))
    .filter((l) => l.startsWith("'"))
    .map((l) => l.slice(1, -1))
    .join('\n');

  const report = buildReport({ text, now: new Date('2026-09-16T12:00:00Z') });
  const ids = report.findings.map((f) => f.id);
  for (const expected of ['expires-past', 'contact-not-uri', 'field-misspelled', 'encryption-insecure', 'languages-invalid', 'field-missing-colon']) {
    assert.ok(ids.includes(expected), `the worked example no longer demonstrates ${expected} (found: ${ids.join(', ')})`);
  }
});
