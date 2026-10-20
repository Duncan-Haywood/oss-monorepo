import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { guide } from "./make-guide.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const GUIDE = "sales-cadence-template.html";

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal or sales-compliance advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with Outreach/);
  assert.match(html, /Best-effort hosting, no SLA/);
});

test("JSON-LD parses and every FAQ question and answer is on the page", () => {
  for (const name of ["index.html", GUIDE]) {
    const html = page(name);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
    const faq = blocks.find((b) => b["@type"] === "FAQPage");
    assert.ok(faq && faq.mainEntity.length >= 3, name);
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
  assert.match(html, /<title>Sales Cadence Builder/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /sales cadence builder and outreach sequence/i);
  assert.match(html, /href="\.\/sales-cadence-template\.html"/);
});

test("every input has a label, and no page code sends data anywhere itself", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 15);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(/aria-label=/.test(tag) || (id && new RegExp(`<label[^>]*for="${id}"`).test(html)), `unlabelled: ${tag}`);
  }
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/);
  for (const f of ["calc.mjs", "usage.mjs", "ai.mjs"]) assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|import\(/, f);
  assert.doesNotMatch(html, /<form[^>]+action=/i);
});

test("the module script imports only local files, and the inline script parses", () => {
  const html = page("index.html");
  const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  for (const m of script.matchAll(/from "([^"]+)"/g)) assert.match(m[1], /^\.\/[\w-]+\.mjs$/);
  new Function(script.replace(/^\s*import .*$/gm, "").replace(/\bawait\b/g, ""));
});

test("the usage events the footer lists are the ones the page records", () => {
  const html = page("index.html");
  const listed = [...html.match(/Anonymous feature events \(([^)]*)\)/)[1].matchAll(/<code>(\w+)<\/code>/g)].map((m) => m[1]).sort();
  const recorded = [...new Set([...html.matchAll(/record\("(\w+)"\)/g)].map((m) => m[1]))].sort();
  assert.deepEqual(recorded, listed);
});

test("the guide is not stale: it is what make-guide.mjs writes from today's engine", () => {
  assert.equal(page(GUIDE), guide(), "run: node make-guide.mjs");
  assert.match(page(GUIDE), /<title>B2B sales cadence template/);
});

test("sitemap and robots point at pages that exist", () => {
  const locs = [...page("sitemap.xml").matchAll(/<loc>\.\/([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs.sort(), [GUIDE, "index.html"].sort());
  for (const l of locs) assert.ok(page(l).length > 100, l);
  assert.match(page("robots.txt"), /Sitemap: \.\/sitemap\.xml/);
});
