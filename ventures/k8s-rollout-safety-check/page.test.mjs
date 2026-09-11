import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';

const index = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const guide = await readFile(
  new URL('./why-your-kubernetes-rollout-drops-requests.html', import.meta.url),
  'utf8',
);
const comparison = await readFile(new URL('./vs-kube-score.html', import.meta.url), 'utf8');

test('the entry page is a working tool, not a landing page', () => {
  assert.match(index, /<textarea/);
  assert.match(index, /id="check"/);
  assert.match(index, /id="load-example"/);
  assert.match(index, /id="manifest"/);
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

// The one claim this product must not make. A tool that reads a manifest
// cannot know how long an app drains, whether the readiness endpoint tests
// anything real, or whether the release carries a breaking migration -- so
// "your deploy is zero-downtime" would be an overclaim even on a clean run.
// Guarded as the assertive forms only: the FAQ deliberately *asks* "does a
// clean result mean my deploy is zero-downtime?", and banning the phrase
// outright would forbid the honest question along with the overclaim.
test('the page never claims a clean result means the deploy is safe or zero-downtime', () => {
  const prose = index.replace(/<script[\s\S]*?<\/script>/g, '');
  const claims = /\b(?:is|are|was|were|will be)\s+(?:zero-downtime|safe|downtime-free)\b/gi;
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
  assert.match(index, /not a guarantee about your deploy/);
  assert.match(index, /not a production-readiness audit/);
});

test('the page tells the visitor it never touches their cluster', () => {
  // The whole reason this is safe to run against production manifests: there
  // is no credential to leak because there is no credential.
  assert.match(index, /never touches your cluster|no way to.{0,40}cluster/i);
  assert.match(index, /no kubeconfig/i);
  assert.match(index, /makes no network calls/i);
});

test('the page lists every check rather than asking to be trusted', () => {
  assert.match(index, /id="check-list"/);
  assert.match(index, /CHECKS/, 'the list must be rendered from the engine, not restated in HTML');
  assert.match(index, /--list-checks/);
});

test('the JSON-LD FAQPage questions match the visible FAQ headings', () => {
  for (const [name, html] of [['index', index], ['guide', guide], ['comparison', comparison]]) {
    const ldMatch = html.match(/"@type":"FAQPage"[\s\S]*?<\/script>/);
    assert.ok(ldMatch, `${name}: expected a FAQPage JSON-LD block`);
    const ld = ldMatch[0];
    // Headings are read from the *static* markup only. The page's own module
    // script builds finding cards with `<h3>` in a template literal, and
    // those are rendered output, not FAQ questions -- counting them would
    // demand a JSON-LD entry for a string that no crawler ever sees.
    const visible = html.replace(/<script[\s\S]*?<\/script>/g, '');
    const headings = [...visible.matchAll(/<h3>([\s\S]*?)<\/h3>/g)].map((m) =>
      m[1].replace(/<[^>]+>/g, '').trim(),
    );
    assert.ok(headings.length > 0, `${name}: expected visible h3 FAQ headings`);
    for (const heading of headings) {
      assert.ok(
        ld.includes(heading) || ld.includes(heading.replace(/’/g, "'")),
        `${name}: visible heading not found in FAQPage JSON-LD: ${heading}`,
      );
    }
  }
});

test('title and meta description carry the actual search phrase', () => {
  assert.match(index, /<title>[^<]*Kubernetes[^<]*Rollout[^<]*<\/title>/);
  assert.match(index, /name="description" content="[^"]*readinessProbe[^"]*"/);
});

test('index links to both secondary pages so crawlers reach them', () => {
  assert.match(index, /href="why-your-kubernetes-rollout-drops-requests\.html"/);
  assert.match(index, /href="vs-kube-score\.html"/);
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
  assert.match(guide, /preStop/);
  assert.match(guide, /readinessProbe/);
  assert.match(comparison, /kube-score/);
});

// A comparison page names another project. It must describe rather than
// benchmark, and must say it is not affiliated -- the honest form of this
// page shape, and the one that keeps it out of trademark trouble.
test('the comparison page disclaims affiliation and does not claim a benchmark', () => {
  assert.match(comparison, /not affiliated/i);
  assert.match(comparison, /not a benchmark/i);
  assert.match(comparison, /When the other tool is the right answer/i);
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
// question on the two stages upstream of a rollout. Without a crawlable link
// here, a crawler entering on this tool never reaches either in one hop.
test('index links one hop to its sibling checkers', () => {
  assert.match(index, /href="\.\.\/pinned-actions-check\/"/);
  assert.match(index, /href="\.\.\/docker-base-image-pin-check\/"/);
});
