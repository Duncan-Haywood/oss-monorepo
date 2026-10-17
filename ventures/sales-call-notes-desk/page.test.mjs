import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyzeCall, followUpEmail, SAMPLE_NOTES } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const GUIDE = "how-to-write-a-sales-follow-up-email.html";
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax or sales-compliance advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with Salesforce/);
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
  assert.match(html, /<title>Sales Call Notes Desk/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /call notes to CRM/i);
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
  new Function(script.replace(/^\s*import .*$/gm, "").replace(/\bawait\b/g, ""));
});

test("the usage events the footer lists are the ones the page records", () => {
  const html = page("index.html");
  const listed = [...html.match(/Anonymous feature events \(([^)]*)\)/)[1].matchAll(/<code>(\w+)<\/code>/g)].map((m) => m[1]).sort();
  const recorded = [...new Set([...html.matchAll(/record\("(\w+)"\)/g)].map((m) => m[1]))].sort();
  assert.deepEqual(recorded, listed);
});

test("the guide's example is not stale: it is what the tool writes today", () => {
  const html = page(GUIDE);
  const a = analyzeCall(SAMPLE_NOTES, { rep: "Me", today: "2026-10-17" });
  const e = followUpEmail(a, { company: "Brightline Logistics", contact: "Dana Reyes", you: "Sam", date: "" });
  assert.ok(html.includes(esc(e.body)), "guide email drifted from followUpEmail; rerun the generator");
  assert.ok(html.includes(esc(SAMPLE_NOTES)), "guide notes drifted from SAMPLE_NOTES");
  assert.ok(html.includes(`finds ${a.qualified} of ${a.total} qualification fields`));
});

test("sitemap and robots point at pages that exist", () => {
  const sm = page("sitemap.xml");
  const locs = [...sm.matchAll(/<loc>\.\/([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs.sort(), [GUIDE, "index.html"].sort());
  for (const l of locs) assert.ok(page(l).length > 100, l);
  assert.match(page("robots.txt"), /Sitemap: \.\/sitemap\.xml/);
});
