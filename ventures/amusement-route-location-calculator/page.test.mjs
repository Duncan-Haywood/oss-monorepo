import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { solve, sampleInput, money, cents } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const GUIDE = "how-much-commission-to-pay-a-location-for-arcade-machines.html";

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not business, tax or financial advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with any machine maker/);
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
  assert.match(html, /<title>Amusement Route Location Calculator/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
  assert.match(page("sitemap.xml"), /how-much-commission-to-pay-a-location-for-arcade-machines\.html/);
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
  const ids = { targetHourly: "th", costPerMile: "cm", prizePct: "pz", cardSharePct: "cs", cardFeePct: "cf", repairPerMachine: "rp", licensePerMachineYear: "lc", machinePrice: "mp", lifeYears: "ly" };
  for (const [k, id] of Object.entries(ids)) assert.equal(val(id), s[k], k);
});

test("the guide's worked example is the engine's answer", () => {
  const html = page(GUIDE);
  const r = solve(sampleInput());
  for (const x of r.rows) {
    const row = `<tr><td>${x.name}</td><td>${cents(x.weeklyTake)}</td><td>${money(x.perHour)}</td><td>${x.maxCommissionPct.toFixed(1)}%</td></tr>`;
    assert.ok(html.includes(row), row);
  }
  assert.ok(html.includes(`<strong>${money(r.totals.perHour)}</strong>`));
  assert.ok(html.includes(`<strong>${r.losingCount}</strong> of the five`));
  // prose claim: the truck stop and pizza parlour are the two that lose money
  assert.deepEqual(r.rows.filter((x) => x.profit < 0).map((x) => x.name), ["Truck stop (three games)", "Pizza parlour (kiddie rides)"]);
});

test("the footer links the venue-side arcade game payback calculator", () => {
  assert.match(page("index.html"), /href="\.\.\/arcade-game-payback-calculator\/"/);
});
