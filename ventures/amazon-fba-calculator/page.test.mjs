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
const seo = readFileSync(new URL("./inbound-placement-fee.html", import.meta.url), "utf8");

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

test("the listing and inbound-placement scripts actually execute", () => {
  const source = parsed.scripts.join("\n");
  assert.match(source, /compareInboundPlacement/);
  assert.match(source, /calculateListing/);
  assert.match(parsed.markup, /id="inbound-placement"/);
  for (const id of [
    "placementUnits",
    "freightMinimal",
    "freightPartial",
    "freightOptimized",
    "placementMinimalPerUnit",
    "placementPartialPerUnit",
    "placementCompare",
    "placementVerdict",
  ]) {
    assert.match(parsed.markup, new RegExp(`id="${id}"`));
  }
});

test("SEO page names the inbound-placement question and links back", () => {
  assert.match(seo, /inbound placement/i);
  assert.match(seo, /<a href="\.\/#inbound-placement">/);
  assert.match(seo, /No warranty/);
});
