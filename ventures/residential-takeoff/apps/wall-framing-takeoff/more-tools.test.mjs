import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { GROUPS, NO_BLOCK, drift, moreTools } from "./more-tools.mjs";

const DIR = new URL("./", import.meta.url);
const html = (f) => readFileSync(new URL(f, DIR), "utf8");
const PAGES = readdirSync(DIR).filter((f) => f.endsWith(".html")).sort();
const LISTED = GROUPS.flatMap(([, links]) => links.map(([href]) => href));

test("every page's more-tools block matches GROUPS (run more-tools.mjs --write)", () => {
  assert.deepEqual(drift(), []);
});

test("GROUPS lists every page once, and only pages that exist", () => {
  assert.equal(new Set(LISTED).size, LISTED.length, "a page is listed twice");
  for (const href of LISTED) assert.ok(PAGES.includes(href), `${href} is listed but missing`);
  const unlisted = PAGES.filter((p) => !LISTED.includes(p) && p !== "sample-bid-package.html");
  assert.deepEqual(unlisted, [], "a page no block links to: add it to GROUPS");
});

test("a page's block never links to the page itself", () => {
  assert.doesNotMatch(moreTools("brace-calculator.html"), /href="brace-calculator\.html"/);
  assert.match(moreTools("brace-calculator.html"), /href="panel-calculator\.html"/);
});

test("every page is reachable from index.html by links inside the venture", () => {
  const seen = new Set(["index.html"]);
  const queue = ["index.html"];
  while (queue.length) {
    for (const [, href] of html(queue.pop()).matchAll(/href="(?:\.\/)?([^"#?/:]+\.html)"/g)) {
      if (PAGES.includes(href) && !seen.has(href)) { seen.add(href); queue.push(href); }
    }
  }
  assert.deepEqual(PAGES.filter((p) => !seen.has(p)), []);
});

test("a page with a visible Questions section has FAQPage JSON-LD naming the same questions", () => {
  for (const page of PAGES.filter((p) => !NO_BLOCK.has(p))) {
    const src = html(page);
    if (!src.includes("<h2>Questions</h2>")) continue;
    const blocks = [...src.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
    const faq = blocks.find((b) => b["@type"] === "FAQPage");
    assert.ok(faq, `${page}: visible questions but no FAQPage`);
    const visible = src.split("<h2>Questions</h2>")[1].split('<nav class="more-tools"')[0];
    for (const q of faq.mainEntity) assert.ok(visible.includes(q.name.replace(/&/g, "&amp;")) || visible.includes(q.name), `${page}: "${q.name}" is not on the page`);
  }
});
