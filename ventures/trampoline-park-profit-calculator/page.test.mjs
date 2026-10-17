import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { solve, compareScenarios, sampleInput, sampleScenario, money, cents, pct } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const GUIDE = "how-much-does-a-trampoline-park-make.html";

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not tax, legal, lending or financial advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with any trampoline park chain/);
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
  assert.match(html, /<title>Trampoline Park Profit Calculator/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
  assert.match(page("sitemap.xml"), /how-much-does-a-trampoline-park-make\.html/);
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

test("the page's default inputs are the engine's sample input and sample scenario", () => {
  const html = page("index.html");
  const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  const A = JSON.parse(script.match(/const A = (\{.*?\});/)[1]);
  const B = JSON.parse(script.match(/const B = (\{.*?\});/)[1]);
  const val = (id) => Number(html.match(new RegExp(`id="${id}"[^>]*value="([^"]+)"`))[1]);
  const s = sampleInput();
  const o = sampleScenario();
  assert.equal(Object.keys(A).length, Object.keys(s).length);
  for (const [k, id] of Object.entries(A)) assert.equal(val(id), s[k], k);
  for (const [k, id] of Object.entries(B)) assert.equal(val(id), o[k], k);
});

test("the guide's worked example is the engine's answer", () => {
  const html = page(GUIDE);
  const r = solve(sampleInput());
  const c = compareScenarios(sampleInput(), sampleScenario());
  for (const v of [r.avail.toFixed(0), r.visits.toFixed(0), cents(r.ticketRevenue), cents(r.snackRevenue), cents(r.partyRevenue), cents(r.memberRevenue), cents(r.staffCost), cents(r.fixed), cents(r.revenue), cents(r.costs), cents(r.profit), money(r.capex), r.paybackMonths.toFixed(1), cents(r.minTicket), cents(r.minPaybackTicket), cents(c.b.profit), c.b.paybackMonths.toFixed(1)]) {
    assert.ok(html.includes(`<strong>${v}</strong>`), v);
  }
  for (const v of [pct(r.margin), pct(r.breakevenFill), r.paybackYears.toFixed(1), cents(r.minTicket - sampleInput().ticket), cents(r.minPaybackTicket - sampleInput().ticket)]) assert.ok(html.includes(v), v);
  for (const s of r.sensitivity) assert.ok(html.includes(money(s.profit)), money(s.profit));
  assert.equal(r.meets, false);
  assert.equal(r.meetsPayback, false);
  assert.equal(c.winnerProfit, "A");
});
