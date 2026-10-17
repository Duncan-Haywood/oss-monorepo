import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { solve, compareJobs, sampleInput, sampleJob, money, cents, pct } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const GUIDE = "how-much-does-a-pilot-car-escort-run-really-make.html";

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not tax, legal, insurance or financial advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with any permit service/);
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
  assert.match(html, /<title>Pilot Car Escort Run Profit Calculator/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
  assert.match(page("sitemap.xml"), /how-much-does-a-pilot-car-escort-run-really-make\.html/);
  assert.match(page("robots.txt"), /Sitemap: \.\/sitemap\.xml/);
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

test("the page's default inputs are the engine's sample input and sample run", () => {
  const html = page("index.html");
  const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  const A = JSON.parse(script.match(/const A = (\{.*?\});/)[1]);
  const B = JSON.parse(script.match(/const B = (\{.*?\});/)[1]);
  const val = (id) => html.match(new RegExp(`id="${id}"[^>]*value="([^"]+)"`))?.[1];
  const sel = (id) => html.match(new RegExp(`<select id="${id}">.*?<option value="(\\w+)" selected`))[1];
  const s = sampleInput();
  const o = sampleJob();
  assert.equal(Object.keys(A).length, Object.keys(s).length);
  for (const [k, id] of Object.entries(A)) assert.equal(k === "mode" ? sel(id) : Number(val(id)), s[k], k);
  for (const [k, id] of Object.entries(B)) assert.equal(k === "mode" ? sel(id) : Number(val(id)), o[k], k);
});

test("the guide's worked example is the engine's answer", () => {
  const html = page(GUIDE);
  const r = solve(sampleInput());
  const c = compareJobs(sampleInput(), sampleJob());
  for (const v of [cents(r.quoted), cents(r.revenue), cents(r.labor), cents(r.fuel), cents(r.processing), cents(r.depreciation), cents(r.fixedShare), cents(r.costs), cents(r.profit), cents(r.profitPerHour), r.breakevenRuns.toFixed(0), cents(r.needRevenue), cents(r.minQuote).replace("$", "$"), cents(c.b.profit), cents(c.b.profitPerHour), cents(c.b.revenue)]) {
    assert.ok(html.includes(v), v);
  }
  for (const v of [cents(r.revenue), cents(r.costs), cents(r.profit), cents(r.profitPerHour), cents(r.depreciation), cents(r.fixedShare), cents(c.b.profit), cents(c.b.profitPerHour)]) assert.ok(html.includes(`<strong>${v}</strong>`), v);
  for (const v of [pct(r.margin), money(r.annualProfit), cents(r.costs - r.processing), cents(r.needRevenue - r.revenue)]) assert.ok(html.includes(v), v);
  assert.ok(html.includes(`<strong>${r.minQuote.toFixed(2).replace(/^/, "$")}</strong>`));
  assert.equal(r.meets, false);
  assert.equal(c.winnerJob, "B");
  assert.equal(c.winnerHour, "A");
});

test("the usage events named in the footer are the ones the page records", () => {
  const html = page("index.html");
  const footer = html.slice(html.indexOf("<footer>"), html.indexOf("</footer>"));
  const named = [...footer.matchAll(/<code>(\w+)<\/code>/g)].map((m) => m[1]);
  const recorded = [...html.matchAll(/record\("(\w+)"\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(recorded)].sort(), named.sort());
});

test("the page links its sibling tool, and the sibling links back", () => {
  assert.match(page("index.html"), /href="\.\.\/tow-truck-rate-calculator\/"/);
  const tow = readFileSync(new URL("../tow-truck-rate-calculator/index.html", import.meta.url), "utf8");
  assert.match(tow, /href="\.\.\/pilot-car-escort-run-profit-calculator\/"/);
});
