import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { TRADES } from "./trades.mjs";

const html = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("every trade calculator links to the engine with its own trade preselected", () => {
  for (const t of TRADES) {
    if (!existsSync(new URL(`../${t.calculator}/index.html`, import.meta.url))) continue;
    const page = html(`../${t.calculator}/index.html`);
    if (!page.includes("<footer>")) continue;
    assert.ok(page.includes(`href="../bid-price-engine/#trade=${t.slug}"`), `${t.calculator} does not link to the engine`);
    assert.equal(page.split("bid-price-engine-link").length - 1, 1, `${t.calculator} has the link more than once`);
  }
});

test("the engine page honours a bare #trade=<slug> link", () => {
  const page = html("index.html");
  assert.match(page, /A bare #trade=<slug>/);
  assert.ok(TRADES.some((t) => t.slug === "junk-removal"));
});
