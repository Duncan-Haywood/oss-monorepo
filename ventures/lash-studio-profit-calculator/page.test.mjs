import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { solve, sampleInput, money, cents } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const GUIDE = "how-much-to-charge-for-lash-extensions.html";

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not business, tax or financial advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with any booking platform/);
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
  assert.match(html, /<title>Lash Studio Profit Calculator/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
  assert.match(page("sitemap.xml"), /how-much-to-charge-for-lash-extensions\.html/);
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
  assert.equal(val("mo"), s.monthlyOverhead);
  assert.equal(val("ho"), s.hoursOpenPerWeek);
  assert.equal(val("ut"), s.utilizationPct);
  assert.equal(val("tm"), s.turnoverMinutes);
  assert.equal(val("th"), s.targetHourly);
  assert.equal(val("cf"), s.cardFeePct);
  assert.equal(val("cx"), s.cardFixedFee);
  assert.equal(val("ns"), s.noShowPct);
  assert.equal(val("dp"), s.depositPct);
  assert.equal(val("rb"), s.rebookPct);
  assert.equal(val("mf"), s.maxFills);
});

test("the guide's worked example is the engine's answer", () => {
  const html = page(GUIDE);
  const s = sampleInput();
  const r = solve(s);
  assert.ok(html.includes(`<strong>${cents(r.overheadPerHour)}</strong>`));
  for (const x of r.rows) {
    const row = `<tr><td>${x.name}</td><td>${cents(x.price)}</td><td>${money(x.perHour)}</td><td>${cents(x.targetPrice)}</td></tr>`;
    assert.ok(html.includes(row), row);
  }
  assert.ok(html.includes(`<strong>${r.client.expectedFills.toFixed(1)}</strong>`));
  assert.ok(html.includes(`<strong>${money(r.client.lifetimeProfit)}</strong>`));
  assert.ok(html.includes(`<strong>${cents(r.client.setPriceFloor)}</strong>`));
  // prose claims: only the volume set clears the target, fills earn about two thirds of it
  assert.deepEqual(r.rows.filter((x) => x.meets).map((x) => x.name), ["Volume full set"]);
  for (const x of r.rows.filter((y) => y.kind === "fill")) assert.ok(x.perHour / s.targetHourly > 0.6 && x.perHour / s.targetHourly < 0.72);
});
