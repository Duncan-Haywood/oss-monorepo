import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { solve, compareOffers, sampleInput, sampleOffer, money, cents } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const GUIDE = "how-much-profit-per-route-for-delivery-van-contractors.html";

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not tax, legal, insurance or financial advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with any delivery platform/);
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
  assert.match(html, /<title>Courier Van Route Profit Calculator/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
  assert.match(page("sitemap.xml"), /how-much-profit-per-route-for-delivery-van-contractors\.html/);
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

test("the page's default inputs are the engine's sample input and sample offer", () => {
  const html = page("index.html");
  const s = sampleInput();
  const o = sampleOffer();
  const val = (id) => Number(html.match(new RegExp(`id="${id}"[^>]*value="([^"]+)"`))[1]);
  const A = { payRoute: "pr", payStop: "ps", payPackage: "pp", stops: "st", packages: "pk", hours: "hr", miles: "mi", tolls: "tl", fuelPrice: "fp", mpg: "mg", vanPayment: "vp", insurance: "ins", maintPerMile: "mt", deprPerMile: "dp", reserve: "rs", taxPct: "tx", routesPerWeek: "rw", weeksPerYear: "wy", targetHourly: "th" };
  const B = { payRoute: "bpr", payStop: "bps", payPackage: "bpp", stops: "bst", packages: "bpk", hours: "bhr", miles: "bmi", tolls: "btl", routesPerWeek: "brw" };
  for (const [k, id] of Object.entries(A)) assert.equal(val(id), s[k], k);
  for (const [k, id] of Object.entries(B)) assert.equal(val(id), o[k], k);
});

test("the guide's worked example is the engine's answer", () => {
  const html = page(GUIDE);
  const r = solve(sampleInput());
  const c = compareOffers(sampleInput(), sampleOffer());
  for (const v of [cents(r.pay), cents(r.fuel), cents(r.fixed), cents(r.costs), cents(r.profit), cents(r.takeHomePerHour), r.breakevenStops.toFixed(1), cents(r.minPay), money(r.annualTakeHome), cents(c.b.takeHomePerHour), cents(c.a.takeHomePerHour), money(c.a.annualTakeHome), money(c.b.annualTakeHome)]) {
    assert.ok(html.includes(`<strong>${v}</strong>`), v);
  }
  for (const v of [cents(r.costPerMile), money(r.profitPerHour), cents(r.profitPerStop), cents(r.takeHome), money(r.weeklyTakeHome)]) assert.ok(html.includes(v), v);
  // prose claims: route is short of the target; offer B wins hourly but loses the year
  assert.equal(r.meets, false);
  assert.equal(c.winnerHourly, "B");
  assert.equal(c.winnerAnnual, "A");
});
