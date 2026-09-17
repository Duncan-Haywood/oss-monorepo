// Guards the one thing a comparison page can get wrong in a way that
// matters: saying something about a competitor that is not true, or quietly
// dropping the disclaimer/non-affiliation copy that makes naming one
// acceptable. Mirrors ventures/no-show-fee-calculator/test/vs-acuity-page.test.mjs.
//
// The numeric assertion is deliberately inverted from this venture's other
// tests. Elsewhere a test pins a worked figure so the arithmetic cannot
// drift; here it asserts there is *no* currency figure at all, because this
// page has no way to verify a competitor's pricing (their site is
// unreachable from the build environment, and any figure copied from memory
// would go stale silently). "Leave the row out rather than estimate it" is
// the rule, and this is what enforces it.
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('./vs-skimmer.html', import.meta.url), 'utf8');

/** Text as a visitor sees it, with entities decoded for the few used here. */
function visibleText(source) {
  return source
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&larr;/g, '←')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

test('comparison page embeds valid JSON-LD and both disclaimer clauses', () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(blocks.length, 1);
  const parsed = JSON.parse(blocks[0][1]);
  assert.equal(parsed['@context'], 'https://schema.org');
  assert.equal(parsed['@type'], 'FAQPage');
  assert.equal(parsed.mainEntity.length, 3);

  assert.match(html, /No warranty\./);
  assert.match(html, /Best-effort hosting, no SLA/);
});

test('every FAQ answer in the schema is visible on the page', () => {
  const text = visibleText(html);
  const parsed = JSON.parse(
    html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1],
  );
  for (const entry of parsed.mainEntity) {
    assert.ok(
      text.includes(entry.name.toLowerCase()),
      `question not visible on the page: ${entry.name}`,
    );
    assert.ok(
      text.includes(entry.acceptedAnswer.text.replace(/\s+/g, ' ').trim().toLowerCase()),
      `answer not visible on the page: ${entry.name}`,
    );
  }
});

test('states non-affiliation and names the trademark owner', () => {
  const text = visibleText(html);
  assert.ok(text.includes('not affiliated with, endorsed by, or sponsored by skimmer'));
  assert.ok(text.includes('trademark of its respective owner'));
});

test('makes no pricing or plan claim about any named platform', () => {
  // No currency figures anywhere: not a price, not a plan tier, not a "from $X".
  assert.equal(/[$£€]\s?\d/.test(html), false, 'page must not quote a competitor figure');
  assert.equal(/\bper month\b|\bmonthly plan\b|\/mo\b/i.test(html), false);
});

test('does not disparage the named platform', () => {
  const text = visibleText(html);
  for (const word of ['worse', 'rip-off', 'ripoff', 'overpriced', 'scam', 'useless']) {
    assert.ok(!text.includes(word), `disparaging word on the page: ${word}`);
  }
  // The page must actively say the platform is worth keeping, not merely
  // avoid insulting it -- that sentence is what makes it an honest
  // comparison rather than a competitor takedown with the edges filed off.
  assert.ok(text.includes('if you already pay for route software, keep it'));
});

test('links back to the calculator', () => {
  assert.match(html, /href="\.\/"/);
});

test('adds no third-party script, font, stylesheet or network call', () => {
  // Only same-page <style>; no <script src>, no <link> to an outside origin.
  assert.equal(/<script[^>]+src=/i.test(html), false);
  assert.equal(/<link[^>]+href="https?:/i.test(html), false);
  assert.equal(/@import|fonts\.googleapis|cdn\./i.test(html), false);
  // Outbound links are citations only, and carry rel="nofollow noopener".
  const external = [...html.matchAll(/<a\b[^>]*href="(https?:[^"]+)"[^>]*>/gi)];
  assert.ok(external.length >= 1);
  for (const [tag] of external) {
    assert.match(tag, /rel="nofollow noopener"/);
  }
});

test("the calculator's entry page and sitemap link to the comparison page", () => {
  const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(index, /href="\.\/vs-skimmer\.html"/);

  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /vs-skimmer\.html/);
});
