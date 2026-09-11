import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLlmsTxt,
  validateLlmsTxt,
  parseSitemapXml,
  parseSectionedInput,
  resolveBaseUrl,
  extractMarkdownSummary,
} from './generator.mjs';

test('buildLlmsTxt requires a title', () => {
  assert.throws(() => buildLlmsTxt({ sections: [] }), /title is required/);
});

test('buildLlmsTxt produces the llmstxt.org shape', () => {
  const out = buildLlmsTxt({
    title: 'Example Site',
    summary: 'A short, structured map of this site for AI assistants.',
    sections: [
      {
        heading: 'Docs',
        links: [
          { title: 'Getting started', url: 'https://example.test/docs/start', note: 'Install and first run.' },
          { title: 'API reference', url: 'https://example.test/docs/api' },
        ],
      },
    ],
  });
  assert.equal(
    out,
    [
      '# Example Site',
      '',
      '> A short, structured map of this site for AI assistants.',
      '',
      '## Docs',
      '- [Getting started](https://example.test/docs/start): Install and first run.',
      '- [API reference](https://example.test/docs/api)',
      '',
    ].join('\n')
  );
});

test('buildLlmsTxt round-trips through validateLlmsTxt as valid', () => {
  const out = buildLlmsTxt({
    title: 'Round Trip',
    summary: 'Summary line.',
    sections: [
      { heading: 'Docs', links: [{ title: 'Start', url: 'https://example.test/start' }] },
      { heading: 'Guides', links: [{ title: 'Migrate', url: 'https://example.test/guides/migrate' }] },
    ],
  });
  const report = validateLlmsTxt(out);
  assert.equal(report.valid, true);
  assert.deepEqual(report.errors, []);
  assert.equal(report.linkCount, 2);
  assert.equal(report.sections.length, 2);
});

test('buildLlmsTxt drops a section with no resolvable links', () => {
  const out = buildLlmsTxt({
    title: 'T',
    sections: [
      { heading: 'Empty', links: [{ title: 'no url', url: '' }] },
      { heading: 'Docs', links: [{ title: 'Start', url: 'https://example.test/start' }] },
    ],
  });
  assert.doesNotMatch(out, /## Empty/);
  assert.match(out, /## Docs/);
});

test('validateLlmsTxt rejects an empty file', () => {
  const report = validateLlmsTxt('');
  assert.equal(report.valid, false);
  assert.match(report.errors[0], /empty/i);
});

test('validateLlmsTxt requires the first line to be an H1, not H2', () => {
  const report = validateLlmsTxt('## Docs\n- [a](https://x.test/a)\n');
  assert.equal(report.valid, false);
  assert.ok(report.errors.some((e) => /H1/.test(e)));
});

test('validateLlmsTxt warns on missing summary but stays valid', () => {
  const report = validateLlmsTxt('# T\n\n## Docs\n- [a](https://x.test/a)\n');
  assert.equal(report.valid, true);
  assert.ok(report.warnings.some((w) => /summary/i.test(w)));
});

test('validateLlmsTxt errors when no links exist anywhere', () => {
  const report = validateLlmsTxt('# T\n\n> summary\n\n## Docs\n');
  assert.equal(report.valid, false);
  assert.ok(report.errors.some((e) => /No Markdown links/.test(e)));
  assert.ok(report.warnings.some((w) => /has no links/.test(w)));
});

test('validateLlmsTxt rejects a malformed link bullet', () => {
  const report = validateLlmsTxt('# T\n\n## Docs\n- not a link\n');
  assert.equal(report.valid, false);
  assert.ok(report.errors.some((e) => /link bullet/.test(e)));
});

test('validateLlmsTxt errors on a link bullet with no preceding section', () => {
  const report = validateLlmsTxt('# T\n\n- [a](https://x.test/a)\n');
  assert.equal(report.valid, false);
  assert.ok(report.errors.some((e) => /before any/.test(e)));
});

test('validateLlmsTxt warns on a relative link URL', () => {
  const report = validateLlmsTxt('# T\n\n## Docs\n- [a](/relative/path)\n');
  assert.equal(report.valid, true);
  assert.ok(report.warnings.some((w) => /not an absolute URL/.test(w)));
});

test('validateLlmsTxt warns on a duplicate link', () => {
  const report = validateLlmsTxt('# T\n\n## Docs\n- [a](https://x.test/a)\n- [a again](https://x.test/a)\n');
  assert.ok(report.warnings.some((w) => /linked more than once/.test(w)));
});

test('parseSitemapXml extracts <loc> values and decodes entities', () => {
  const xml = `<?xml version="1.0"?>
<urlset><url><loc>https://example.test/a?x=1&amp;y=2</loc></url>
<url><loc>https://example.test/b</loc></url></urlset>`;
  assert.deepEqual(parseSitemapXml(xml), ['https://example.test/a?x=1&y=2', 'https://example.test/b']);
});

test('parseSitemapXml returns an empty array for non-sitemap text', () => {
  assert.deepEqual(parseSitemapXml('not xml at all'), []);
});

test('parseSectionedInput groups url | title | description lines under headings', () => {
  const sections = parseSectionedInput(`
## Docs
https://x.test/start | Getting started | First steps
https://x.test/api | API reference

## Guides
https://x.test/migrate | Migration guide
`);
  assert.equal(sections.length, 2);
  assert.equal(sections[0].heading, 'Docs');
  assert.equal(sections[0].links.length, 2);
  assert.equal(sections[0].links[0].title, 'Getting started');
  assert.equal(sections[0].links[0].note, 'First steps');
  assert.equal(sections[0].links[1].title, 'API reference');
  assert.equal(sections[0].links[1].note, undefined);
  assert.equal(sections[1].heading, 'Guides');
  assert.equal(sections[1].links[0].url, 'https://x.test/migrate');
});

test('parseSectionedInput uses a default "Docs" section when no heading is given', () => {
  const sections = parseSectionedInput('/a | A\n/b | B\n');
  assert.equal(sections.length, 1);
  assert.equal(sections[0].heading, 'Docs');
  assert.equal(sections[0].links.length, 2);
});

test('parseSectionedInput ignores blank lines and comment lines', () => {
  const sections = parseSectionedInput('# a comment, not a section\n\n## Docs\n/a | A\n');
  assert.equal(sections.length, 1);
  assert.equal(sections[0].links.length, 1);
});

test('parseSectionedInput falls back to the URL as the title when none is given', () => {
  const sections = parseSectionedInput('## Docs\n/a\n');
  assert.equal(sections[0].links[0].title, '/a');
});

test('resolveBaseUrl prefixes relative paths and leaves absolute URLs alone', () => {
  const sections = [
    { heading: 'Docs', links: [{ url: '/a', title: 'A' }, { url: 'https://other.test/b', title: 'B' }] },
  ];
  const resolved = resolveBaseUrl(sections, 'https://example.test/');
  assert.equal(resolved[0].links[0].url, 'https://example.test/a');
  assert.equal(resolved[0].links[1].url, 'https://other.test/b');
});

test('resolveBaseUrl adds a leading slash when the path lacks one', () => {
  const resolved = resolveBaseUrl([{ heading: 'Docs', links: [{ url: 'a/b', title: 'A' }] }], 'https://example.test');
  assert.equal(resolved[0].links[0].url, 'https://example.test/a/b');
});

test('resolveBaseUrl is a no-op with no base URL', () => {
  const sections = [{ heading: 'Docs', links: [{ url: '/a', title: 'A' }] }];
  assert.deepEqual(resolveBaseUrl(sections, ''), sections);
});

test('extractMarkdownSummary reads the first H1 and the first paragraph after it', () => {
  const { title, description } = extractMarkdownSummary('# Getting Started\n\nInstall the package, then run it.\n\nMore detail.\n');
  assert.equal(title, 'Getting Started');
  assert.equal(description, 'Install the package, then run it.');
});

test('extractMarkdownSummary skips a blockquote or sub-heading before the paragraph', () => {
  const { title, description } = extractMarkdownSummary('# T\n\n> a quote\n\n## sub\n\nActual paragraph.\n');
  assert.equal(title, 'T');
  assert.equal(description, 'Actual paragraph.');
});

test('extractMarkdownSummary returns nulls when there is no H1', () => {
  const { title, description } = extractMarkdownSummary('Just text, no heading.\n');
  assert.equal(title, null);
  assert.equal(description, null);
});
