import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const PAGES = ["index.html", "instant-runoff-vs-condorcet-four-city-example.html"];
const ld = (html) => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

test("every page carries the no-warranty clause, independence line and sponsor link", () => {
  for (const p of PAGES) {
    const html = page(p);
    assert.match(html, /No warranty/, p);
    assert.match(html, /not legal or professional advice/, p);
    assert.match(html, /not certified election software/, p);
    assert.match(html, /Not affiliated with or endorsed by/, p);
    assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/, p);
  }
  assert.match(page("index.html"), /Everything runs in your browser/);
});

test("JSON-LD blocks parse, each FAQ matches the visible questions, and there are no ratings", () => {
  for (const p of PAGES) {
    const html = page(p);
    const faq = ld(html).find((b) => b["@type"] === "FAQPage");
    assert.ok(faq && faq.mainEntity.length >= 2, p);
    for (const q of faq.mainEntity) {
      assert.ok(html.includes(`<h3>${esc(q.name)}</h3>`), q.name);
      assert.ok(html.includes(`<p>${esc(q.acceptedAnswer.text)}</p>`), q.name);
    }
    assert.ok(!/AggregateRating|"Review"/.test(html));
  }
  assert.equal(ld(page("index.html"))[0].offers.price, "0");
});

test("SEO basics on every page", () => {
  for (const p of PAGES) {
    const html = page(p);
    assert.match(html, /<title>[^<]{20,}<\/title>/, p);
    assert.match(html, /<meta name="description" content="[^"]{80,320}"/, p);
    assert.match(html, new RegExp(`<link rel="canonical" href="\\./${p.replace(".", "\\.")}">`), p);
    assert.match(html, /<meta property="og:title"/, p);
    assert.equal((html.match(/<h1>/g) || []).length, 1, p);
    assert.match(html, /<html lang="en">/, p);
    assert.match(page("sitemap.xml"), new RegExp(p === "index.html" ? "ranked-ballot-counter/<" : p.replace(".", "\\.")));
  }
});

test("every input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 4);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(id && html.includes(`<label for="${id}">`), `unlabelled: ${tag}`);
  }
  for (const f of [...PAGES, "ballots.mjs", "usage.mjs", "cli.mjs"]) assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/, f);
});

test("the usage events named in the footer are the ones the page records", () => {
  const html = page("index.html");
  const recorded = [...html.matchAll(/record\("([a-z_]+)"\)/g)].map((m) => m[1]);
  for (const e of new Set(recorded)) assert.ok(html.includes(`<code>${e}</code>`), e);
});
