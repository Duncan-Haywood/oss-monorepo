import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CROPS, buildSeason, planCrop, cropById, prettyDate } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const GUIDE = "when-to-start-seeds-indoors.html";

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not agricultural, horticultural, legal or financial advice/i);
  assert.match(html, /not a forecast/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with any seed company/);
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
  assert.match(html, /<title>Vegetable Garden Planting Calendar/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /when to start seeds indoors/i);
  assert.match(page("sitemap.xml"), /when-to-start-seeds-indoors\.html/);
});

test("every static input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= CROPS.length);
  for (const tag of inputs) {
    if (/type="checkbox"/.test(tag) && /name="crop"/.test(tag)) continue; // wrapped by its own <label>
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(/aria-label=/.test(tag) || (id && new RegExp(`<label[^>]*for="${id}"`).test(html)) || /id="cautious"/.test(tag), `unlabelled: ${tag}`);
  }
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|import\(/);
  assert.doesNotMatch(page("usage.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
  assert.doesNotMatch(html, /<form[^>]+action=/i);
});

test("every crop in the engine has a checkbox, and every checkbox names a real crop", () => {
  const html = page("index.html");
  const values = [...html.matchAll(/name="crop" value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(values.sort(), CROPS.map((c) => c.id).sort());
});

test("the guide's worked dates are the engine's dates", () => {
  const html = page(GUIDE);
  const season = buildSeason({ lastFrost: "2026-05-01", firstFrost: "2026-10-10" });
  for (const id of ["tomato", "pepper", "eggplant", "broccoli", "cabbage", "basil", "watermelon"]) {
    const c = cropById(id);
    const seg = planCrop(c, season).segments[0];
    const row = `<tr><td>${c.name}</td><td>${prettyDate(seg.indoorStart[0])}</td><td>${prettyDate(seg.dates[0])}</td><td>${prettyDate(seg.harvestFrom)}</td></tr>`;
    assert.ok(html.includes(row), row);
  }
});
