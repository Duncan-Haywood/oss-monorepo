import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validate } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with Google/);
});

test("the page's own JSON-LD passes the validator it ships", () => {
  const html = page("index.html");
  const res = validate(html.replace(/<script type="module">[\s\S]*?<\/script>/, ""));
  assert.equal(res.blocks, 2);
  assert.equal(res.errors, 0, JSON.stringify(res.entities.map((e) => e.findings)));
  assert.deepEqual(res.entities.map((e) => e.types[0]), ["SoftwareApplication", "FAQPage"]);
  const faq = JSON.parse([...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)][1][1]);
  for (const q of faq.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("SEO basics", () => {
  const html = page("index.html");
  assert.match(html, /<title>JSON-LD Rich Result Validator/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
});

test("every input has a label (static or generated) and nothing is sent anywhere", () => {
  const html = page("index.html");
  for (const tag of [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0])) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(id && html.includes(`<label for="${id}">`), `unlabelled: ${tag}`);
  }
  assert.match(html, /<label for="f-\$\{id\}">/);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/);
  for (const f of ["calc.mjs", "usage.mjs"]) assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|import\(/);
  assert.doesNotMatch(html, /<form[^>]+action=/i);
});

test("user text is escaped before reaching innerHTML", () => {
  const html = page("index.html");
  assert.match(html, /const esc = /);
  assert.match(html, /esc\(f\.message\)/);
  assert.match(html, /esc\(p\.message\)/);
});

test("the pasted-markup example validates with deliberate errors", () => {
  const res = validate(JSON.stringify({ "@context": "https://schema.org", "@type": "Product", name: "Trail Mug", offers: { "@type": "Offer", price: "$14.00", priceCurrency: "usd" }, aggregateRating: { ratingValue: 4.6 } }));
  assert.ok(res.errors >= 2);
});
