import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';

const index = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const secondary = await readFile(
  new URL('./how-to-set-least-privilege-permissions-for-github-actions.html', import.meta.url),
  'utf8',
);

test('the entry page is a working tool, not a landing page', () => {
  assert.match(index, /<textarea/);
  assert.match(index, /id="check"/);
  assert.match(index, /id="load-example"/);
  assert.match(index, /id="add-file"/);
  assert.match(index, /classify\.mjs/);
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

test('the page never claims a clean scan means the repository or workflow is secure', () => {
  // Guarded as the assertive forms only -- the FAQ deliberately *asks* "does
  // a clean scan mean my workflow is secure?", which is the honest question,
  // so a blanket ban on the phrase would forbid the question along with the
  // overclaim.
  const prose = index.replace(/<script[\s\S]*?<\/script>/g, '');
  const claims = /\b(?:is|are|was|were)\s+secure\b/gi;
  for (const match of prose.matchAll(claims)) {
    const preceding = prose.slice(Math.max(0, match.index - 60), match.index);
    const following = prose.slice(match.index + match[0].length, match.index + match[0].length + 12);
    const denied = /\b(?:never|not|no|cannot|does not|doesn't)\b/i.test(preceding);
    const asked = following.trimStart().startsWith('?');
    assert.ok(
      denied || asked,
      `unqualified security claim near: ${JSON.stringify(prose.slice(Math.max(0, match.index - 60), match.index + 40))}`,
    );
  }
  assert.match(index, /not a security audit/);
});

test('the page tells the visitor it makes no network calls and does not know the repository default', () => {
  assert.match(index, /makes no network calls/i);
  assert.match(index, /no public API for that setting/i);
});

test('the JSON-LD FAQPage questions match the visible FAQ headings', () => {
  const ldMatch = index.match(/"@type":"FAQPage"[\s\S]*?<\/script>/);
  assert.ok(ldMatch, 'expected a FAQPage JSON-LD block');
  const ld = ldMatch[0];
  const headings = [...index.matchAll(/<h3>(.*?)<\/h3>/g)].map((m) =>
    m[1].replace(/<[^>]+>/g, '').trim(),
  );
  assert.ok(headings.length > 0, 'expected visible h3 FAQ headings');
  for (const heading of headings) {
    assert.ok(
      ld.includes(heading) || ld.includes(heading.replace(/’/g, "'")),
      `visible heading not found in FAQPage JSON-LD: ${heading}`,
    );
  }
});

test('title and meta description carry the actual search phrase', () => {
  assert.match(index, /<title>[^<]*Permissions[^<]*GITHUB_TOKEN[^<]*<\/title>/);
  assert.match(index, /name="description" content="[^"]*permissions[^"]*"/i);
});

test('index links to the how-to docs page', () => {
  assert.match(
    index,
    /href="how-to-set-least-privilege-permissions-for-github-actions\.html"/,
    'index must link the secondary docs page so crawlers can reach it',
  );
});

test('docs page links back to the tool', () => {
  assert.match(secondary, /href="\.\/"/);
});

test('secondary docs page answers the search question without a warranty gap', () => {
  assert.match(secondary, /permissions/i);
  assert.match(secondary, /FAQPage/);
  assert.match(secondary, /No warranty/);
  assert.match(secondary, /no SLA/i);
});

test('every .html file in the venture is reachable from the sitemap', async () => {
  const sitemap = await readFile(new URL('./sitemap.xml', import.meta.url), 'utf8');
  const dir = new URL('./', import.meta.url);
  const htmlFiles = readdirSync(dir).filter((name) => name.endsWith('.html'));
  for (const name of htmlFiles) {
    if (name === 'index.html') continue;
    assert.match(sitemap, new RegExp(name.replace(/\./g, '\\.')), `${name} is missing from sitemap.xml`);
  }
});

// Closest siblings: all three are free, browser-only GitHub Actions workflow
// checkers. Without a crawlable link here, a crawler entering on this tool
// never reaches the other two in one hop.
test('index links one hop to the pinned-actions-check and actions-injection-check siblings', () => {
  assert.match(
    index,
    /href="\.\.\/pinned-actions-check\/"/,
    'index must link ../pinned-actions-check/ so crawlers reach the pinning checker in one hop',
  );
  assert.match(
    index,
    /href="\.\.\/actions-injection-check\/"/,
    'index must link ../actions-injection-check/ so crawlers reach the injection checker in one hop',
  );
});

// The reciprocal half of oidc-trust-policy-check's own link back here. That
// tool reads the *cloud* end of the same trust boundary this one reads from
// the repository end, and it was a crawlable orphan until this link existed —
// `platform/pages/siblings.mjs` fails on an orphan, so removing this without
// replacing the inbound hop turns that suite red rather than failing silently.
test('index links one hop to the oidc-trust-policy-check sibling', () => {
  assert.match(
    index,
    /href="\.\.\/oidc-trust-policy-check\/"/,
    'index must link ../oidc-trust-policy-check/ so crawlers reach the trust-policy checker in one hop',
  );
});

// Inbound hop for actions-timeout-check, which would otherwise be a crawlable
// orphan (`platform/pages/siblings.mjs` fails on one).
test('index links one hop to the actions-timeout-check sibling', () => {
  assert.match(
    index,
    /href="\.\.\/actions-timeout-check\/"/,
    'index must link ../actions-timeout-check/ so crawlers reach the timeout checker in one hop',
  );
});

test("links to Workflow Audit, its sibling", async () => {
  assert.match(await readFile(new URL("./index.html", import.meta.url), "utf8"), /href="\.\.\/workflow-audit\/"/);
});
