import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { solve, sampleInput, money } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const GUIDE = "what-is-a-money-factor.html";

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not financial, legal, tax or consumer-credit advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with any automaker/);
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
  assert.match(html, /<title>Car Lease Deal Checker/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
  assert.match(page("sitemap.xml"), /what-is-a-money-factor\.html/);
});

test("nothing is sent anywhere and static inputs are labelled", () => {
  const html = page("index.html");
  const staticHtml = html.replace(/<script type="module">[\s\S]*?<\/script>/, "");
  for (const tag of staticHtml.matchAll(/<(input|select)\b[^>]*>/g)) {
    const t = tag[0];
    const id = t.match(/\sid="([^"]+)"/)?.[1];
    if (/type="radio"|type="checkbox"/.test(t)) continue; // wrapped by their own <label>
    if (/type="file"/.test(t)) { assert.match(t, /aria-label=/); continue; }
    assert.ok(id && new RegExp(`<label[^>]*for="${id}"`).test(html), `unlabelled: ${t}`);
  }
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|import\(/);
  assert.doesNotMatch(html, /<form[^>]+action=/i);
});

test("every field the page reads exists, and maps to a field the engine uses", () => {
  const html = page("index.html");
  const map = html.match(/const IDS = (\{[^}]+\})/)[1];
  for (const m of map.matchAll(/\w+: "(\w+)"/g)) assert.match(html, new RegExp(`id="${m[1]}"`), m[1]);
  for (const [, key] of map.matchAll(/(\w+): "\w+"/g)) assert.ok(key in sampleInput(), key);
});

test("the guide's worked example is the engine's output", () => {
  const html = page(GUIDE);
  const R = solve({ ...sampleInput(), taxRate: 7 });
  for (const s of [money(R.adjCap).replace(".00", ""), money(R.dep), money(R.fin), money(R.pmt), money(R.monthly)]) assert.ok(html.includes(s), s);
  assert.ok(html.includes("$22 a month, $790"), "markup sentence");
  assert.equal(Math.round(R.markup.perMonth), 22);
  assert.equal(Math.round(R.markup.overTerm), 790);
});
