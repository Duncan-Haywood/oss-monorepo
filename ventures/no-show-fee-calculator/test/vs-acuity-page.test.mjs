// Guards the one thing a comparison page can get wrong in a way that matters:
// saying something about a competitor that is not true, or quietly dropping
// the disclaimer/non-affiliation copy that makes naming one acceptable.
//
// The numeric assertion is deliberately inverted from the rest of this
// venture's tests. Elsewhere a test pins a worked figure so the arithmetic
// cannot drift; here it asserts there is *no* currency figure at all, because
// this page has no way to verify a competitor's pricing (their sites are
// unreachable from the build environment, and any figure copied from memory
// would go stale silently). "Leave the row out rather than estimate it" is the
// rule, and this is what enforces it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

function readPage() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return readFileSync(path.join(here, "..", "vs-acuity-scheduling.html"), "utf8");
}

/** Text as a visitor sees it, with entities decoded for the few we use. */
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&larr;/g, "←")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

test("comparison page embeds valid JSON-LD and both disclaimer clauses", () => {
  const html = readPage();
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(blocks.length, 1);
  const parsed = JSON.parse(blocks[0][1]);
  assert.equal(parsed["@context"], "https://schema.org");
  assert.equal(parsed["@type"], "FAQPage");
  assert.equal(parsed.mainEntity.length, 3);

  assert.match(html, /No warranty\./);
  assert.match(html, /Best-effort hosting, no SLA/);
});

test("every FAQ answer in the schema is visible on the page", () => {
  const html = readPage();
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
      text.includes(entry.acceptedAnswer.text.replace(/\s+/g, " ").trim().toLowerCase()),
      `answer not visible on the page: ${entry.name}`,
    );
  }
});

test("states non-affiliation and names the trademark owner", () => {
  const text = visibleText(readPage());
  assert.ok(text.includes("not affiliated with, endorsed by, or sponsored by acuity scheduling"));
  assert.ok(text.includes("trademark of its respective owner"));
});

test("makes no pricing or plan claim about any named platform", () => {
  const html = readPage();
  // No currency figures anywhere: not a price, not a plan tier, not a "from $X".
  assert.equal(/[$£€]\s?\d/.test(html), false, "page must not quote a competitor figure");
  assert.equal(/\bper month\b|\bmonthly plan\b|\/mo\b/i.test(html), false);
});

test("does not disparage the named platforms", () => {
  const text = visibleText(readPage());
  for (const word of ["worse", "rip-off", "ripoff", "overpriced", "scam", "useless"]) {
    assert.ok(!text.includes(word), `disparaging word on the page: ${word}`);
  }
  // The page must actively say the platform is worth keeping, not merely
  // avoid insulting it -- that sentence is what makes it an honest comparison
  // rather than a competitor takedown with the edges filed off.
  assert.ok(text.includes("if you already pay for scheduling software, keep it"));
});

test("links back to the calculator and its sibling explainers", () => {
  const html = readPage();
  assert.match(html, /href="\.\/"/);
  assert.match(html, /href="24h-vs-48h-cancellation-notice\.html"/);
  assert.match(html, /href="should-i-overbook-or-charge-a-no-show-fee\.html"/);
});

test("adds no third-party script, font, stylesheet or network call", () => {
  const html = readPage();
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

test("the calculator's entry page links to it, so it is not orphaned", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const index = readFileSync(path.join(here, "..", "index.html"), "utf8");
  assert.match(index, /href="vs-acuity-scheduling\.html"/);

  const sitemap = readFileSync(path.join(here, "..", "sitemap.xml"), "utf8");
  assert.match(sitemap, /vs-acuity-scheduling\.html/);
});
