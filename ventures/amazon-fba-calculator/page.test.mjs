// Structural tests for the calculator pages.
//
// calc.test.mjs imports calc.mjs and never looks at the HTML. These checks
// catch the class of defect that has shipped on other static calculators here:
// an unclosed textarea/script/style that swallows the app, or a feature
// section whose ids the script expects but the markup dropped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const seo = readFileSync(new URL("./peak-vs-off-peak-storage.html", import.meta.url), "utf8");

function parse(source) {
  const RAW = /<(textarea|script|style)\b[^>]*>/i;
  let rest = source;
  let markup = "";
  const scripts = [];
  for (;;) {
    const open = rest.match(RAW);
    if (!open) return { markup: markup + rest, scripts, unclosed: null };
    const tag = open[1].toLowerCase();
    const contentStart = open.index + open[0].length;
    markup += rest.slice(0, contentStart);
    const closer = new RegExp(`</${tag}\\s*>`, "i").exec(rest.slice(contentStart));
    if (!closer) return { markup, scripts, unclosed: tag };
    if (tag === "script") scripts.push(rest.slice(contentStart, contentStart + closer.index));
    markup += closer[0];
    rest = rest.slice(contentStart + closer.index + closer[0].length);
  }
}

const parsed = parse(html);

test("index.html does not leave a raw-text element unclosed", () => {
  assert.equal(parsed.unclosed, null);
});

test("the listing and storage-season scripts actually execute", () => {
  const source = parsed.scripts.join("\n");
  assert.match(source, /compareStorageSeasons/);
  assert.match(source, /calculateListing/);
  assert.match(source, /listingInput/);
  assert.match(source, /blendedStorageRate/);
  assert.match(parsed.markup, /id="storage-season"/);
  for (const id of [
    "peakMonths",
    "monthsInStorage",
    "storageRate",
    "storageCompare",
    "storageVerdict",
    "storageSit",
  ]) {
    assert.match(parsed.markup, new RegExp(`id="${id}"`));
  }
});

test("SEO page names the peak-storage question and links back", () => {
  assert.match(seo, /peak storage/i);
  assert.match(seo, /<a href="\.\/#storage-season">/);
  assert.match(seo, /No warranty/);
});
