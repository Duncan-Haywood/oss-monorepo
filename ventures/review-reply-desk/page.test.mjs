import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { composeReply } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const GUIDE = "how-to-respond-to-a-negative-google-review.html";

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with Google/);
  assert.match(html, /Best-effort hosting, no SLA/);
});

test("JSON-LD parses and every FAQ question and answer is on the page", () => {
  for (const name of ["index.html", GUIDE]) {
    const html = page(name);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
    const faq = blocks.find((b) => b["@type"] === "FAQPage");
    assert.ok(faq && faq.mainEntity.length >= 4, name);
    for (const q of faq.mainEntity) {
      assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
      assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
    }
  }
  const app = JSON.parse(page("index.html").match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(app["@type"], "SoftwareApplication");
  assert.equal(app.offers.price, "0");
});

test("SEO basics", () => {
  const html = page("index.html");
  assert.match(html, /<title>Review Reply Desk/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /Google review reply generator/i);
});

test("every input has a label, and no page code sends data anywhere itself", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 10);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(/aria-label=/.test(tag) || (id && new RegExp(`<label[^>]*for="${id}"`).test(html)), `unlabelled: ${tag}`);
  }
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|import\(/);
  assert.doesNotMatch(page("usage.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
  assert.doesNotMatch(html, /<form[^>]+action=/i);
});

test("the module scripts import only local files, and the inline script parses", () => {
  const html = page("index.html");
  const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  for (const m of script.matchAll(/from "([^"]+)"/g)) assert.match(m[1], /^\.\/[\w-]+\.mjs$/);
  new Function(script.replace(/^\s*import .*$/gm, "").replace(/\bawait\b/g, "")) ;
});

test("the page's example is not stale: the guide's replies are what composeReply writes today", () => {
  const html = page(GUIDE);
  const profile = { business: "Luigi's Trattoria", owner: "Luigi", contact: "555-123-4567", type: "restaurant", tone: "warm" };
  const rv = { rating: 1, reviewer: "Tom R", body: "Waited over an hour, the food was cold and the waiter was rude. I want a refund." };
  const text = composeReply(rv, profile).text.replace(/\n/g, "<br>");
  assert.ok(html.includes(text), "guide example 2 drifted from composeReply; rerun the generator");
});

test("sitemap and robots point at pages that exist", () => {
  const sm = page("sitemap.xml");
  for (const m of sm.matchAll(/<loc>\.\/([^<]+)<\/loc>/g)) assert.ok(page(m[1]).length > 100, m[1]);
  assert.match(page("robots.txt"), /Sitemap: \.\/sitemap\.xml/);
});
