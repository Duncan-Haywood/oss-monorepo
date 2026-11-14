// node --test site/use-pages.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { USE_PAGES, renderUsePage, rankLink, SITE } from "../scripts/build-use-pages.mjs";
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
