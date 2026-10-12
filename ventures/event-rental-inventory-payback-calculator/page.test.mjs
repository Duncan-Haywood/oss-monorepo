import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { solve, sampleInput, money, cents, pct } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const GUIDE = "which-rental-items-pay-for-themselves.html";

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not tax, legal, insurance or financial advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with any rental software/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /id="optout"/);
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
  assert.match(html, /<title>Event Rental Inventory Payback Calculator/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
  assert.match(page("sitemap.xml"), /which-rental-items-pay-for-themselves\.html/);
  assert.match(page("robots.txt"), /Sitemap: \.\/sitemap\.xml/);
});

test("nothing is sent anywhere and static and generated inputs are labelled", () => {
  const html = page("index.html");
  const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  const staticHtml = html.replace(/<script type="module">[\s\S]*?<\/script>/, "");
  for (const tag of staticHtml.matchAll(/<(input|select)\b[^>]*>/g)) {
    const t = tag[0];
    const id = t.match(/\sid="([^"]+)"/)?.[1];
    if (/type="file"/.test(t)) { assert.match(t, /aria-label=/); continue; }
    assert.ok(id && new RegExp(`<label[^>]*for="${id}"`).test(html), `unlabelled: ${t}`);
  }
  assert.match(script, /aria-label="Item ' \+ n \+ " " \+ l/); // generated number inputs carry an accessible name
  assert.match(script, /aria-label="Item ' \+ n \+ ' name"/);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|import\(/);
  assert.doesNotMatch(html, /<form[^>]+action=/i);
});

test("the page's default global inputs are the engine's sample", () => {
  const html = page("index.html");
  const val = (id) => Number(html.match(new RegExp(`id="${id}"[^>]*value="([^"]+)"`))[1]);
  assert.equal(val("pc"), sampleInput().processPct);
  assert.equal(val("ty"), sampleInput().targetYears);
  assert.match(html, /fill\(sampleInput\(\)\)/);
  // every per-item field the engine validates has a column on the page
  const cols = [...html.matchAll(/\["(\w+)", "[^"]+"\]/g)].map((m) => m[1]);
  assert.deepEqual(cols, Object.keys(sampleInput().items[0]).filter((k) => k !== "name"));
});

test("the guide's worked example is the engine's answer", () => {
  const html = page(GUIDE);
  const r = solve(sampleInput());
  const by = Object.fromEntries(r.items.map((x) => [x.name, x]));
  const ch = by["Chiavari chairs"];
  const fc = by["Folding chairs"];
  const df = by["Dance floor panels"];
  for (const v of [money(ch.invested), money(ch.revenue), money(ch.handling), money(ch.processing), money(ch.losses), money(ch.storage), money(ch.cash), money(ch.profit), pct(ch.roi), ch.breakevenRentals.toFixed(1), pct(df.roi), df.paybackYears.toFixed(1), cents(df.minPrice)]) {
    assert.ok(html.includes(`<strong>${v}</strong>`), v);
  }
  for (const v of [money(ch.depreciation), ch.paybackYears.toFixed(1), cents(-df.priceGap), pct(fc.roi), fc.paybackYears.toFixed(1)]) assert.ok(html.includes(v), v);
  assert.ok(ch.roi / df.roi > 5.5 && ch.roi / df.roi < 6); // "almost six times"
});

test("the usage events named in the footer are the ones the page records", () => {
  const html = page("index.html");
  const footer = html.slice(html.indexOf("<footer>"), html.indexOf("</footer>"));
  const named = [...footer.matchAll(/<code>(\w+)<\/code>/g)].map((m) => m[1]);
  const recorded = [...html.matchAll(/record\("(\w+)"\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(recorded)].sort(), named.sort());
});
