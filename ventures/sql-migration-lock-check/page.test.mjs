import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';

const index = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const guide = await readFile(new URL('./why-your-migration-locked-the-table.html', import.meta.url), 'utf8');
const comparison = await readFile(new URL('./vs-squawk.html', import.meta.url), 'utf8');

test('the entry page is a working tool, not a landing page', () => {
  assert.match(index, /<textarea/);
  assert.match(index, /id="check"/);
  assert.match(index, /id="load-example"/);
  assert.match(index, /id="sql"/);
  assert.match(index, /engine\.mjs/);
});

test('the page carries the portfolio disclaimers and stays local', () => {
  assert.match(index, /No warranty/);
  assert.match(index, /Best-effort hosting, no SLA/);
  assert.match(index, /never uploaded/i);
  assert.match(index, /no network calls/i);
  assert.match(index, /SoftwareApplication/);
  assert.match(index, /Turn usage counting off/);
  assert.match(index, /sponsors\/Duncan-Haywood/);
});

// The one claim this product must not make. A tool that reads SQL text cannot
// know a table's size, its traffic, or how long the queries already running on
// it will take -- and those are what decide whether a migration is safe. So
// "this migration is safe" would be an overclaim even on a clean run, and the
// overclaim is the one that gets someone paged.
//
// Guarded as the assertive forms only: the FAQ deliberately *asks* "does a
// clean result mean the migration is safe to run?", and banning the phrase
// outright would forbid the honest question along with the overclaim.
test('the page never claims a clean result means the migration is safe', () => {
  const prose = index.replace(/<script[\s\S]*?<\/script>/g, '');
  // Longest alternative first: JavaScript alternation is leftmost-match, so
  // `safe|safe to run` matches just `safe` and the "is it phrased as a
  // question?" test below then looks at " to run?" instead of "?" and fails on
  // the honest FAQ heading.
  const claims = /\b(?:is|are|was|were|will be)\s+(?:safe to run|downtime-free|lock-free|safe)\b/gi;
  for (const match of prose.matchAll(claims)) {
    const preceding = prose.slice(Math.max(0, match.index - 70), match.index);
    const following = prose.slice(match.index + match[0].length, match.index + match[0].length + 12);
    const denied = /\b(?:never|not|no|cannot|does not|doesn't|guarantee that)\b/i.test(preceding);
    const asked = following.trimStart().startsWith('?');
    assert.ok(
      denied || asked,
      `unqualified safety claim near: ${JSON.stringify(prose.slice(Math.max(0, match.index - 70), match.index + 40))}`,
    );
  }
  assert.match(index, /not a review of your migration/);
  assert.match(index, /not a database review/);
});

test('the page tells the visitor it never connects to their database', () => {
  // The whole reason this is safe to run against a production migration:
  // there is no connection string to point at the wrong database.
  assert.match(index, /never connects to a database|no way to.{0,60}database/i);
  assert.match(index, /no connection string/i);
  assert.match(index, /makes no network calls/i);
});

test('the page lists every check rather than asking to be trusted', () => {
  assert.match(index, /id="check-list"/);
  assert.match(index, /CHECKS/, 'the list must be rendered from the engine, not restated in HTML');
  assert.match(index, /--list-checks/);
});

// The page claims some checks are "relational" and that this is the wedge. The
// claim is only honest if the list actually marks them, and if the marked set
// matches the ids the engine really treats that way.
test('the relational checks named in the page exist in the engine', async () => {
  const { CHECKS } = await import('./engine.mjs');
  const declared = new Set(CHECKS.map((c) => c.id));
  const marked = index.match(/const RELATIONAL = new Set\(\[([\s\S]*?)\]\)/);
  assert.ok(marked, 'the page should mark its relational checks');
  const listed = [...marked[1].matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
  assert.ok(listed.length >= 3, 'at least the three the prose claims');
  for (const id of listed) {
    assert.ok(declared.has(id), `page marks ${id} relational but the engine has no such check`);
  }
});

test('the JSON-LD FAQPage questions match the visible FAQ headings', () => {
  // The FAQ heading level differs between the two page shapes, and both are
  // correct: the tool page keeps a dedicated "Common questions" block of
  // `h3`s under `h2` section headings, while the guide and the comparison are
  // narratives whose `h2` section headings *are* the questions. So the level
  // is named per page rather than guessed -- selecting on the question mark
  // alone picks up section headings like "Prefer a CLI, or want this as a CI
  // gate?", which is not an FAQ entry and should not be forced into schema.
  for (const [name, html, tag] of [['index', index, 'h3'], ['guide', guide, 'h2'], ['comparison', comparison, 'h2']]) {
    const ldMatch = html.match(/"@type":"FAQPage"[\s\S]*?<\/script>/);
    assert.ok(ldMatch, `${name}: expected a FAQPage JSON-LD block`);
    const ld = ldMatch[0];
    // Headings are read from the *static* markup only. The page's own module
    // script builds finding cards with `<h3>` in a template literal, and those
    // are rendered output, not FAQ questions -- counting them would demand a
    // JSON-LD entry for a string no crawler ever sees.
    const visible = html.replace(/<script[\s\S]*?<\/script>/g, '');
    // Question-shaped headings only: a non-question section heading such as
    // "Checking a migration before you run it" is not an FAQ entry and should
    // not be forced into the schema.
    const headings = [...visible.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))]
      .map((m) => m[1].replace(/<[^>]+>/g, '').trim())
      .filter((h) => h.endsWith('?'));
    assert.ok(headings.length > 0, `${name}: expected visible question headings`);
    for (const heading of headings) {
      assert.ok(
        ld.includes(heading) || ld.includes(heading.replace(/’/g, "'")),
        `${name}: visible heading not found in FAQPage JSON-LD: ${heading}`,
      );
    }
  }
});

test('title and meta description carry the actual search phrase', () => {
  assert.match(index, /<title>[^<]*Migration[^<]*<\/title>/);
  assert.match(index, /name="description" content="[^"]*CONCURRENTLY[^"]*"/);
  assert.match(index, /name="description" content="[^"]*lock_timeout[^"]*"/);
});

test('index links to both secondary pages so crawlers reach them', () => {
  assert.match(index, /href="why-your-migration-locked-the-table\.html"/);
  assert.match(index, /href="vs-squawk\.html"/);
});

test('secondary pages link back to the tool', () => {
  assert.match(guide, /href="\.\/"/);
  assert.match(comparison, /href="\.\/"/);
});

test('secondary pages answer their search question without a warranty gap', () => {
  for (const [name, html] of [['guide', guide], ['comparison', comparison]]) {
    assert.match(html, /No warranty/, `${name} is missing the warranty disclaimer`);
    assert.match(html, /no SLA/i, `${name} is missing the hosting disclaimer`);
  }
  assert.match(guide, /lock_timeout/);
  assert.match(guide, /ACCESS EXCLUSIVE/);
  assert.match(guide, /lock queue/i);
  assert.match(comparison, /squawk/);
});

// A comparison page names another project. It must describe rather than
// benchmark, and must say it is not affiliated -- the honest form of this page
// shape, and the one that keeps it out of trademark trouble.
test('the comparison page disclaims affiliation and does not claim a benchmark', () => {
  assert.match(comparison, /not affiliated/i);
  assert.match(comparison, /not a benchmark/i);
  assert.match(comparison, /When is squawk the right answer\?/i);
});

test('the guide keeps the version-dependent claims qualified', () => {
  // Every fast path this tool leans on is version-gated. A guide that states
  // them flatly would be wrong for a reader on an older PostgreSQL, and wrong
  // in the direction that costs them an outage.
  assert.match(guide, /PostgreSQL 11/);
  assert.match(guide, /PostgreSQL 12/);
  assert.match(guide, /vary by PostgreSQL version|verify against the version/i);
});

test('every .html file in the venture is reachable from the sitemap', async () => {
  const sitemap = await readFile(new URL('./sitemap.xml', import.meta.url), 'utf8');
  const dir = new URL('./', import.meta.url);
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.html'))) {
    if (name === 'index.html') continue;
    assert.match(sitemap, new RegExp(name.replace(/\./g, '\\.')), `${name} is missing from sitemap.xml`);
  }
});

// Closest siblings: the same "does shipping this quietly break something?"
// question at the two stages around a migration. Without a crawlable link
// here, a crawler entering on this tool never reaches either in one hop.
test('index links one hop to its sibling checkers', () => {
  assert.match(index, /href="\.\.\/k8s-rollout-safety-check\/"/);
  assert.match(index, /href="\.\.\/pinned-actions-check\/"/);
});

test('the worked example in the page is the one the engine test pins', async () => {
  // The page tells the visitor the example is an ordinary migration that would
  // pass review. If the two drift, the page is describing something the tool
  // no longer does.
  const { analyzeSql } = await import('./engine.mjs');
  const example = index.match(/const EXAMPLE = `([\s\S]*?)`;/);
  assert.ok(example, 'the page should carry a worked example');
  const result = analyzeSql(example[1]);
  assert.equal(result.verdict, 'can-block');
  assert.ok(result.counts.risk >= 4, 'the example should demonstrate several distinct risks');
});
