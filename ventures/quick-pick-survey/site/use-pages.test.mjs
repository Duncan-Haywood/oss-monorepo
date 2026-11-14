// node --test site/use-pages.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { USE_PAGES, renderUsePage, rankLink, shortlistLink, SITE } from "../scripts/build-use-pages.mjs";
import { decodeList, parseList, MIN_ITEMS, MAX_ITEMS } from "./rank-core.mjs";

test("every use page is the current output of scripts/build-use-pages.mjs", () => {
  for (const page of USE_PAGES) assert.equal(readFileSync(join(SITE, `${page.slug}.html`), "utf8"), renderUsePage(page), page.slug);
});

test("each page's start link decodes back to its own list and question", () => {
  for (const page of USE_PAGES) {
    const d = decodeList(rankLink(page).split("#")[1]);
    assert.ok(d, page.slug);
    assert.deepEqual(d.items, page.items, `${page.slug}: items survive parseList unchanged`);
    assert.equal(d.title, page.question);
    assert.ok(d.items.length >= MIN_ITEMS && d.items.length <= MAX_ITEMS);
    assert.deepEqual(parseList(d.items.join("\n")), d.items);
  }
});

test("pages carry the disclaimer, a canonical URL, a usage counter and a description search engines will show whole", () => {
  for (const page of USE_PAGES) {
    const html = renderUsePage(page);
    assert.match(html, /<strong>Disclaimer\.<\/strong>/);
    assert.match(html, new RegExp(`rel="canonical" href="https://marisstella.app/quick-pick-survey/${page.slug}.html"`));
    assert.match(html, /import \{ record \} from "\.\/usage\.mjs"/);
    assert.ok(page.description.length <= 220, `${page.slug} description ${page.description.length} chars`);
    assert.equal(new Set(USE_PAGES.map((p) => p.slug)).size, USE_PAGES.length);
  }
});

test("the ready-lists hub is current, links every use page, and every use page links back to it", async () => {
  const { renderHub, HUB_SLUG } = await import("../scripts/build-use-pages.mjs");
  const hub = renderHub();
  assert.equal(readFileSync(join(SITE, `${HUB_SLUG}.html`), "utf8"), hub);
  assert.match(hub, /<strong>Disclaimer\.<\/strong>/);
  assert.match(hub, new RegExp(`rel="canonical" href="https://marisstella.app/quick-pick-survey/${HUB_SLUG}.html"`));
  for (const page of USE_PAGES) {
    assert.ok(hub.includes(`href="${page.slug}.html"`), `hub links ${page.slug}`);
    assert.ok(renderUsePage(page).includes(`href="${HUB_SLUG}.html"`), `${page.slug} links the hub`);
  }
  const index = readFileSync(join(SITE, "index.html"), "utf8");
  assert.ok(index.includes(`href="${HUB_SLUG}.html"`), "landing page links the hub");
});

test("a page's shortlist link opens the ranker in top-k mode on the same list, with a k that fits it", () => {
  const withShortlist = USE_PAGES.filter((p) => p.shortlist);
  assert.ok(withShortlist.length >= 1);
  for (const page of USE_PAGES) {
    const link = shortlistLink(page);
    if (!page.shortlist) { assert.equal(link, null); assert.doesNotMatch(renderUsePage(page), /use_page_shortlist/); continue; }
    const d = decodeList(link.split("#")[1]);
    assert.equal(d.mode, "top", page.slug);
    assert.equal(d.k, page.shortlist.k);
    assert.equal(d.modeIgnored, undefined);
    assert.deepEqual(d.items, page.items);
    assert.ok(renderUsePage(page).includes(`record("use_page_shortlist:${page.slug}")`), "the click is counted");
  }
});
