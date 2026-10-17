import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { collect, parseExperiments, summariseRuns, verdictOf } from './devlog.mjs';
import { inline, renderMarkdown, resolveHref, summaryOf, titleOf } from './markdown.mjs';
import { headlines, renderDoc, renderExperiments, renderIndex, toJson } from './render.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('markdown escapes raw HTML and drops script links', () => {
  const html = renderMarkdown('Hi <script>alert(1)</script> [x](javascript:alert(1)) [y](https://e.com)');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('javascript:'));
  assert.ok(html.includes('<a href="https://e.com">y</a>'));
});

test('repository-relative links resolve to the file on GitHub', () => {
  assert.equal(
    resolveHref('../../steering.md', 'prompts/process/backlog/README.md'),
    'https://github.com/Duncan-Haywood/oss-monorepo/blob/main/prompts/steering.md',
  );
  assert.equal(resolveHref('#x', 'a.md'), '#x');
});

test('a link whose label is code stays a link, and code is not formatted', () => {
  const html = inline('Read [`a.md`](a.md) and `**not bold**` and #7003', 'prompts/x.md');
  assert.match(html, /<a href="[^"]+prompts\/a\.md"><code>a\.md<\/code><\/a>/);
  assert.ok(html.includes('<code>**not bold**</code>'));
  assert.match(html, /<a href="[^"]+\/pull\/7003">#7003<\/a>/);
});

test('blocks: title dropped, headings demoted, tables, lists, fences', () => {
  const md = '# Title\n\nPara one\ncontinues.\n\n## Sub\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- one\n- two\n\n```\n<b>x</b>\n```\n';
  const html = renderMarkdown(md, { dropTitle: true });
  assert.ok(!html.includes('Title'));
  assert.ok(html.includes('<h3>Sub</h3>'));
  assert.ok(html.includes('<p>Para one continues.</p>'));
  assert.ok(html.includes('<td>1</td><td>2</td>'));
  assert.ok(html.includes('<ul><li>one</li><li>two</li></ul>'));
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'));
  assert.equal(titleOf(md), 'Title');
  assert.equal(summaryOf(md), 'Para one continues.'.length >= 20 ? 'Para one continues.' : '');
});

test('experiments: fields, continuation lines, verdicts', () => {
  const src = `# Log

## E1: first (2026-10-12)

- Change: did a thing
  across two lines.
- Result: helped, 3 of 4 runs.

## E2: second

- Change: another.
- Audit: extra field.
- Result: (next review)
`;
  const ex = parseExperiments(src);
  assert.deepEqual(ex.map((e) => e.id), ['E2', 'E1']);
  assert.equal(ex[1].fields.Change, 'did a thing across two lines.');
  assert.equal(ex[1].date, '2026-10-12');
  assert.equal(ex[1].verdict, 'helped');
  assert.equal(ex[0].verdict, 'pending');
  assert.equal(ex[0].fields.Audit, 'extra field.');
  assert.equal(verdictOf('too few runs (4)'), 'too few runs');
  assert.equal(verdictOf('no change: 12% vs 13%'), 'no change');
  assert.equal(verdictOf(''), 'pending');
});

test('run records: friction ranked by file, strings and objects both counted', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'devlog-'));
  const rec = (name, r) => writeFileSync(path.join(dir, name), JSON.stringify(r));
  rec('2026-10-15-a.json', { date: '2026-10-15', track: 'ventures', outcome: 'success', doc_friction: [{ file: 'CLAUDE.md', issue: 'old' }] });
  rec('2026-10-16-b.json', {
    date: '2026-10-16', track: 'research', outcome: 'partial',
    doc_friction: [{ file: 'CLAUDE.md', issue: 'new' }, { file: 'x.md', issue: 'y' }, 'bare string'],
    deviations: [{ file: 'p.md', why: 'skipped' }],
    integrity_issues: ['caught a fabricated figure'],
  });
  writeFileSync(path.join(dir, 'broken.json'), '{');
  const s = summariseRuns(dir);
  assert.equal(s.records, 2);
  assert.equal(s.friction[0].file, 'CLAUDE.md');
  assert.equal(s.friction[0].count, 2);
  assert.equal(s.friction[0].latest, '2026-10-16');
  assert.equal(s.friction[0].examples[0].text, 'new');
  assert.ok(s.friction.some((f) => f.file === '(unnamed)'));
  assert.equal(s.deviations[0].examples[0].text, 'skipped');
  assert.equal(s.integrity.length, 1);
  assert.deepEqual(s.outcomes, { success: 1, partial: 1 });
  assert.equal(s.by_day['2026-10-16'].friction, 3);
});

test('an empty repository yields empty sections, not errors', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'devlog-empty-'));
  const a = collect(dir, { now: new Date('2026-10-16T00:00:00Z') });
  assert.equal(a.experiments.length, 0);
  assert.equal(a.runs.records, 0);
  const html = renderIndex(a);
  assert.ok(html.includes('<h1>Development analyses</h1>'));
  // The site's shared header, linking home from two levels down.
  assert.match(html, /<nav class="pfs-head" aria-label="Site" data-pfs-head>/);
  assert.match(html, /class="pfs-brand" href="\.\.\/\.\.\/" data-pf-to="hub"/);
  assert.deepEqual(headlines(a), []);
});

test('the real repository renders every page, and the JSON carries no document bodies', () => {
  const a = collect(REPO);
  assert.ok(a.experiments.length > 0, 'prompts/experiments.md parsed');
  assert.ok(a.runs.records > 0, 'run records read');
  const index = renderIndex(a);
  assert.ok(index.includes('name="viewport"'));
  for (const e of a.experiments) assert.ok(index.includes(`experiments/#${e.id.toLowerCase()}`));
  assert.ok(renderExperiments(a).includes(a.experiments[0].id));
  for (const kind of ['reports', 'drift', 'studies'])
    for (const doc of a[kind]) assert.ok(renderDoc(doc, kind, a.generated).includes('<article class="doc">'));
  const json = toJson(a);
  assert.ok(json.studies.every((d) => !('markdown' in d)));
});

test('a study without a README is skipped', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'devlog-studies-'));
  mkdirSync(path.join(dir, 'portfolio', 'research', 'empty'), { recursive: true });
  mkdirSync(path.join(dir, 'portfolio', 'research', 'real'), { recursive: true });
  writeFileSync(path.join(dir, 'portfolio', 'research', 'real', 'README.md'), '# Real study\n\nMeasured on 2026-10-14 with real data and code.\n');
  const a = collect(dir);
  assert.deepEqual(a.studies.map((s) => [s.slug, s.date]), [['real', '2026-10-14']]);
});
