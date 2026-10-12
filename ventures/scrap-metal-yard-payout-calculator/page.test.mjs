import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { solve, sampleInput, cents } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const GUIDE = "is-a-farther-scrap-yard-worth-the-drive.html";

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not tax, legal or financial advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with any scrap yard/);
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
  assert.match(html, /<title>Scrap Metal Yard Payout Calculator/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
  assert.match(page("sitemap.xml"), /is-a-farther-scrap-yard-worth-the-drive\.html/);
  assert.match(html, /href="\.\/is-a-farther-scrap-yard-worth-the-drive\.html"/);
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
  const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|import\(/);
  assert.doesNotMatch(html, /<form[^>]+action=/i);
  // rows added in script must be labelled too
  assert.match(script, /aria-label="Lot ' \+ n \+ ' metal"/);
  assert.match(script, /aria-label="Lot ' \+ n \+ ' weight unit"|"Lot " \+ n \+ " weight unit"/);
});

test("the page's default inputs are the engine's sample input", () => {
  const html = page("index.html");
  const s = sampleInput();
  const val = (id) => html.match(new RegExp(`id="${id}"[^>]*value="([^"]+)"`))[1];
  const ids = { yardA: { name: "an", oneWayMiles: "am", minutes: "at", fee: "af", deductPct: "ad" }, yardB: { name: "bn", oneWayMiles: "bm", minutes: "bt", fee: "bf", deductPct: "bd" } };
  for (const y of ["yardA", "yardB"]) for (const [k, id] of Object.entries(ids[y])) assert.equal(val(id), String(s[y][k]), `${y}.${k}`);
  assert.equal(Number(val("pm")), s.perMile);
  assert.equal(Number(val("hr")), s.hourly);
  const sid = { weightLb: "sw", insulatedPrice: "si", bareCopperPrice: "sb", recoveryPct: "sr", minutesPerLb: "sm" };
  for (const [k, id] of Object.entries(sid)) assert.equal(Number(val(id)), s.strip[k], k);
  assert.match(html, /fill\(sampleInput\(\)\)/);
});

test("the guide's worked example is the engine's answer", () => {
  const html = page(GUIDE);
  const r = solve(sampleInput());
  for (const v of [r.grossA, r.grossB, r.tripA.total, r.tripB.total, r.netA, r.netB, r.netSplit, r.strip.sellInsulated, r.strip.sellBare, r.strip.timeCost, r.strip.gain].map(cents)) {
    assert.ok(html.includes(`<strong>${v}</strong>`), v);
  }
  for (const v of [cents(r.options[2].gross), cents(r.sensitivity[0].netA), cents(r.sensitivity[1].netA), cents(r.netPerLb), cents(r.strip.extraPerHour), r.catchUp.pctChange.toFixed(1) + "%", r.strip.breakevenRecoveryPct.toFixed(1) + "%", r.totalLb.toFixed(0)]) assert.ok(html.includes(v), v);
  assert.equal(r.best.key, "A");
});
