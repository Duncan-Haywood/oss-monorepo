import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { STAGES, NOT_TOOLS, allPages, placeOf, withJourney, hubHtml, journeyBlock, studioToolsHtml } from "./journey.mjs";

const read = f => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const htmlFiles = readdirSync(new URL(".", import.meta.url)).filter(f => f.endsWith(".html"));
const hrefFile = h => (h === "./" ? "index.html" : h);

test("every path link points at a page that exists, and none is listed twice", () => {
  const seen = new Set();
  for (const { href } of allPages()) {
    assert.ok(existsSync(new URL(`./${hrefFile(href)}`, import.meta.url)), href);
    assert.ok(!seen.has(href), `${href} listed twice`);
    seen.add(href);
  }
});

test("every html page is on the path, except the hub and the landing page", () => {
  const onPath = new Set(allPages().map(p => hrefFile(p.href)));
  for (const f of htmlFiles) {
    if (NOT_TOOLS.has(f)) continue;
    assert.ok(onPath.has(f), `${f} is not on the launch path (add it to journey.mjs)`);
  }
});

test("neighbours: the first page has no 'before', the last has no 'next', and order is stage order", () => {
  const all = allPages();
  assert.equal(placeOf(all[0].href).prev, null);
  assert.equal(placeOf(all.at(-1).href).next, null);
  assert.equal(placeOf("pricepoint.html").stage.id, "price");
  assert.equal(placeOf("pricepoint.html").prev.href, "prices.html");
  assert.equal(placeOf("pricepoint.html").next.href, "returns.html");
  assert.equal(placeOf("nope.html"), null);
  assert.equal(STAGES.length, 6);
});

test("refreshing a block is idempotent and replaces an old one", () => {
  const base = "<main><p>x</p></main>";
  const once = withJourney(base, "pod.html");
  assert.equal(withJourney(once, "pod.html"), once);
  assert.equal((once.match(/<!-- journey -->/g) || []).length, 1);
  const stale = once.replace("Before:", "Old:");
  assert.equal(withJourney(stale, "pod.html"), once);
  assert.equal(withJourney(once, "launch.html"), base, "a page off the path loses its block");
  assert.throws(() => withJourney("<p>no main</p>", "pod.html"), /no <\/main>/);
});

test("every tool page's block is current (run `node linkjourney.mjs`)", () => {
  for (const f of htmlFiles) {
    if (NOT_TOOLS.has(f)) continue;
    const html = read(f);
    assert.ok(html.includes(journeyBlock(f === "index.html" ? "./" : f)), `${f} block is missing or stale`);
  }
});

test("launch.html lists exactly the path (run `node buildhub.mjs`), with the no-warranty clause", () => {
  const html = read("launch.html");
  assert.ok(html.includes(hubHtml()), "hub list is stale");
  assert.match(html, /No warranty\./);
  assert.match(html, /<title>[^<]{20,}<\/title>/);
});

test("the studio page's Every tool section lists the whole path (run `node buildhub.mjs`)", () => {
  const html = read("index.html");
  assert.ok(html.includes(studioToolsHtml()), "Every tool section is missing or stale");
  for (const { href } of allPages()) if (href !== "./") assert.ok(html.includes(`href="${href}"`), href);
});

test("labels are escaped", () => {
  assert.ok(!journeyBlock("fit.html").includes("<script"));
});
