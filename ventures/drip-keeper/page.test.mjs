import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateSequences, simulate } from "./engine.mjs";

const file = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = file("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /Everything on this page runs in your browser/);
  assert.match(html, /no uptime or delivery guarantee/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("every form control has a label and the page makes no network requests", () => {
  const html = file("index.html");
  for (const id of ["seqs", "evs", "nm", "days"]) assert.match(html, new RegExp(`<label for="${id}">`), id);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
});

test("the page imports modules that exist and never a Node-only one", () => {
  const html = file("index.html");
  for (const m of html.matchAll(/from "\.\/([a-z]+\.mjs)"/g)) {
    assert.doesNotThrow(() => file(m[1]), m[1]);
    assert.doesNotMatch(file(m[1]), /from "node:/, `${m[1]} must run in a browser`);
  }
});

test("the in-page FAQ matches the structured data", () => {
  const html = file("index.html");
  const ld = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faq = ld.find((x) => x["@type"] === "FAQPage");
  for (const q of faq.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("the sequences pre-filled on the page and in examples/ are valid and send mail", () => {
  const onPage = JSON.parse(file("index.html").match(/<textarea id="seqs"[^>]*>([\s\S]*?)<\/textarea>/)[1].replace(/&lt;/g, "<").replace(/&amp;/g, "&"));
  assert.deepEqual(onPage, JSON.parse(file("examples/sequences.json")));
  assert.ok(validateSequences(onPage).length >= 2);
  assert.ok(simulate(onPage, [{ atHours: 0, event: "signed_up" }], { days: 30 }).some((x) => x.kind === "email"));
});

test("robots and sitemap let crawlers find the page; deploy files point at this directory", () => {
  assert.match(file("robots.txt"), /Allow: \//);
  assert.match(file("sitemap.xml"), /index\.html/);
  assert.match(file("render.yaml"), /dockerContext: ventures\/drip-keeper/);
  assert.match(file("Dockerfile"), /COPY engine\.mjs server\.mjs/);
});

test("footer links the sibling Flag Keeper", () => {
  assert.match(file("index.html"), /href="\.\.\/flag-keeper\/"/);
});

test("footer names help-keeper so no sibling is an orphan", () => { assert.match(page("index.html"), /href="\.\.\/help-keeper\/"/); });
test("footer names slot-keeper so no sibling is an orphan", () => { assert.match(page("index.html"), /href="\.\.\/slot-keeper\/"/); });
