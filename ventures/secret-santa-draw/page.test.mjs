import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAllowed, countDraws, draw, mulberry32 } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const GUIDE = "secret-santa-rules-for-couples-and-no-repeats.html";

test("index page carries the disclaimer, privacy line, honor-system caveat and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, financial or tax advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /honor system/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with any gift-exchange service/);
  assert.match(html, /Best-effort hosting, no SLA/);
});

test("JSON-LD blocks parse and every FAQ question is on the page", () => {
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
  assert.match(html, /<title>Secret Santa Draw/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /secret santa generator/i);
  assert.match(page("sitemap.xml"), /secret-santa-rules-for-couples-and-no-repeats\.html/);
});

test("every static input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 8);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(/aria-label=/.test(tag) || (id && new RegExp(`<label[^>]*for="${id}"`).test(html)), `unlabelled: ${tag}`);
  }
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|import\(/);
  assert.doesNotMatch(page("usage.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
  assert.doesNotMatch(html, /<form[^>]+action=/i);
});

test("the guide's worked counts are the engine's counts", () => {
  const html = page(GUIDE);
  const al = buildAllowed(4, [[0, 1], [2, 3]]);
  for (const [label, mode] of [["Swaps allowed", "any"], ["No swaps", "noswap"], ["One big loop", "loop"]]) {
    assert.ok(html.includes(`<tr><td>${label}</td><td>${countDraws(al, mode)}</td></tr>`), label);
  }
  const r = draw({ names: ["Ann", "Ben", "Cara"], allowed: buildAllowed(3, [[0, 1]]), mode: "any", rng: mulberry32(1) });
  assert.equal(r.ok, false);
  assert.match(r.message, /Ann and Ben can only give to Cara/);
});

test("the guide's last-year numbers are the engine's numbers", () => {
  const html = page(GUIDE);
  const ring = (n) => Array.from({ length: n }, (_, i) => [i, (i + 1) % n]);
  const fmt = (x) => x.toLocaleString("en-US");
  const text = `a group of five goes from ${fmt(countDraws(buildAllowed(5), "any"))} valid draws to ${fmt(countDraws(buildAllowed(5, [], ring(5)), "any"))}, and a group of eight from ${fmt(countDraws(buildAllowed(8), "any"))} to ${fmt(countDraws(buildAllowed(8, [], ring(8)), "any"))}`;
  assert.ok(html.includes(text), text);
});
