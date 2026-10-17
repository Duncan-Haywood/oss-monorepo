import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze, sampleInput, aliveLine } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const GUIDE = "what-is-a-burn-multiple.html";

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, financial, tax or securities advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with any accelerator/);
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
  assert.match(html, /<title>Investor Update Builder/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
  assert.match(page("sitemap.xml"), /what-is-a-burn-multiple\.html/);
});

test("nothing is sent anywhere and static inputs are labelled", () => {
  const html = page("index.html");
  const staticHtml = html.replace(/<script type="module">[\s\S]*?<\/script>/, "");
  for (const tag of staticHtml.matchAll(/<(input|select|textarea)\b[^>]*>/g)) {
    const t = tag[0];
    const id = t.match(/\sid="([^"]+)"/)?.[1];
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

test("dynamic month rows label every input (each is wrapped in its own label)", () => {
  const html = page("index.html");
  const row = html.match(/function monthRow[\s\S]*?return d;/)[0];
  const tags = [...row.matchAll(/<input type="number" class="[^"]+"/g)];
  assert.equal(tags.length, 4);
  for (const tag of tags) {
    const before = row.slice(0, tag.index);
    assert.ok(before.lastIndexOf("<label>") > before.lastIndexOf("</label>"), tag[0]);
  }
});

test("the guide's worked example is the engine's output", () => {
  const html = page(GUIDE);
  const R = analyze({
    company: "Acme", latest: "2026-09",
    months: [{ mrr: 20000, customers: 40, cash: 400000 }, { mrr: 22000, customers: 44, cash: 380000 }, { mrr: 24200, customers: 48, cash: 355000 }, { mrr: 26600, customers: 53, cash: 325000 }],
  });
  assert.ok(R.ok);
  assert.equal(R.avgBurn, 25000);
  assert.equal(R.runway, 13);
  assert.equal(R.cashOutLabel, "Oct 2027");
  assert.equal(R.burnMultiple.toFixed(2), "1.04");
  assert.equal((R.cmgr * 100).toFixed(1), "10.0");
  assert.equal(R.alive.profitMonth, 7);
  assert.equal(R.profitLabel, "Apr 2027");
  assert.equal((R.requiredGrowth * 100).toFixed(1), "2.8");
  assert.equal(R.burnClass, "great");
  for (const s of ["$25,000 a month", "13.0 months", "October 2027", "<strong>1.04</strong>", "+10.0%", "7 months", "April 2027", "2.8%", "$28,800", "$51,600"]) assert.ok(html.includes(s), s);
  assert.match(aliveLine(R), /Default alive/);
});

test("footer links the sibling tools", () => {
  const html = page("index.html");
  for (const s of ["saas-efficiency-metrics-calculator", "cash-runway-planner", "mrr-waterfall-calculator"]) assert.match(html, new RegExp(`href="\\.\\./${s}/"`));
});
