import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { solve, sampleInput, MAX_BIDS, money, cents } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const GUIDE = "corn-store-or-sell-at-harvest.html";

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not marketing, financial, tax or agronomic advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with any elevator/);
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
  assert.match(html, /<title>Grain Store or Sell Calculator/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
  assert.match(page("sitemap.xml"), /corn-store-or-sell-at-harvest\.html/);
});

test("nothing is sent anywhere and static inputs are labelled", () => {
  const html = page("index.html");
  const staticHtml = html.replace(/<script type="module">[\s\S]*?<\/script>/, "");
  for (const tag of staticHtml.matchAll(/<(input|select)\b[^>]*>/g)) {
    const t = tag[0];
    const id = t.match(/\sid="([^"]+)"/)?.[1];
    if (/type="file"/.test(t)) { assert.match(t, /aria-label=/); continue; }
    assert.ok(id && new RegExp(`<label[^>]*for="${id}"`).test(html), `unlabelled: ${t}`);
  }
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|import\(/);
  assert.doesNotMatch(html, /<form[^>]+action=/i);
});

test("the page's default inputs are the engine's sample input", () => {
  const html = page("index.html");
  const s = sampleInput();
  const val = (id) => Number(html.match(new RegExp(`id="${id}"[^>]*value="([^"]+)"`))[1]);
  assert.equal(val("bushels"), s.bushels);
  assert.equal(val("hm"), s.harvestMoisture);
  assert.equal(val("sm"), s.storeMoisture);
  assert.equal(val("hp"), s.harvestPrice);
  assert.equal(val("dry"), s.dryRate);
  assert.equal(val("hs"), s.handlingShrinkPct);
  assert.equal(val("bl"), s.binLossPctPerMonth);
  assert.equal(val("sc"), s.storageCostPerMonth);
  assert.equal(val("ir"), s.interestPct);
  assert.ok(s.bids.length <= MAX_BIDS);
});

test("the guide's worked example is the engine's answer", () => {
  const html = page(GUIDE);
  const r = solve(sampleInput());
  assert.ok(html.includes(`<strong>${money(r.sell.net)}</strong>`));
  for (const o of r.options) {
    const row = `<tr><td>${o.label}</td><td>${cents(o.price)}</td><td>${cents(o.breakEven)}</td><td>${money(o.advantage)}</td></tr>`;
    assert.ok(html.includes(row), row);
  }
  // the prose names the winner; keep it honest
  assert.equal(r.options[r.bestIndex - 1].label, "Mar");
  const jul = r.options.find((o) => o.label === "Jul");
  assert.ok(jul.price === Math.max(...r.options.map((o) => o.price)));
});

test("footer links the ag spray drone quote calculator sibling", () => {
  assert.match(page("index.html"), /href="\.\.\/ag-spray-drone-quote-calculator\/"/);
});
