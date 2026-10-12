import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CITIES, tzOffsetHours, normalize, buildDay, sampleFields, fmtTime, fmtDur } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const GUIDE = "wedding-photography-timeline.html";

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, financial or professional wedding-planning advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with any wedding planner/);
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
  assert.match(html, /<title>Wedding Day Timeline Builder/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /wedding day timeline/i);
  assert.match(page("sitemap.xml"), /wedding-photography-timeline\.html/);
});

test("every static input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 25);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    const wrapped = id && new RegExp(`<label[^>]*class="check"[^>]*><input[^>]*id="${id}"`).test(html);
    assert.ok(/aria-label=/.test(tag) || wrapped || (id && new RegExp(`<label[^>]*for="${id}"`).test(html)), `unlabelled: ${tag}`);
  }
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|import\(/);
  assert.doesNotMatch(page("usage.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
  assert.doesNotMatch(html, /<form[^>]+action=/i);
});

test("every id the page script reads exists in the markup", () => {
  const html = page("index.html");
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const used = [...html.matchAll(/\$\("#([a-z-]+)"\)/g)].map((m) => m[1]);
  for (const id of used) assert.ok(ids.has(id), `script reads #${id}, which the markup does not define`);
});

test("the guide's worked times are the engine's times", () => {
  const html = page(GUIDE);
  const day = (firstLook) => {
    const f = { ...sampleFields(2026), firstLook, cocktailMin: 60 };
    const c = CITIES.find((x) => x.name === f.city);
    return buildDay(normalize({ ...f, lat: c.lat, lon: c.lon, offset: tzOffsetHours(f.date, c.tz) }).p);
  };
  const a = day(true);
  const b = day(false);
  const find = (d, t) => d.events.find((e) => e.title.startsWith(t));
  const rec = (d) => d.cocktailEnd - d.events.find((e) => e.title.startsWith("Cocktail hour")).start;
  const rows = [
    ["Hair and makeup begins", fmtTime(a.hairStart), fmtTime(b.hairStart)],
    ["First look", fmtTime(find(a, "First look").start), "none"],
    ["Family portraits begin", fmtTime(find(a, "Family portraits").start), fmtTime(find(b, "Family portraits").start)],
    ["Ceremony", fmtTime(find(a, "Ceremony").start), fmtTime(find(b, "Ceremony").start)],
    ["Couple joins the cocktail hour", fmtTime(a.coupleFree), fmtTime(b.coupleFree)],
    ["Cocktail hour length for guests", fmtDur(rec(a)), fmtDur(rec(b))],
    ["Grand entrance", fmtTime(find(a, "Grand entrance").start), fmtTime(find(b, "Grand entrance").start)],
  ];
  for (const r of rows) assert.ok(html.includes(`<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`), r.join(" | "));
  assert.ok(html.includes(`Sunset is at ${fmtTime(a.sun.sunset)}`));
  assert.ok(html.includes(`that is ${fmtTime(a.golden.start)}`) || html.includes(`${fmtTime(a.golden.start)}, in the middle`));
  const extra = b.cocktailEnd - (b.ceremonyEnd + 60);
  assert.ok(html.includes(`guests wait an extra ${extra} minutes`));
  assert.ok(html.includes("15 + 30 + 26 + 35 = 106 minutes"));
});

test("footer links to the sibling wedding tools", () => {
  const html = page("index.html");
  assert.match(html, /href="\.\.\/wedding-photographer-profit-calculator\/"/);
  assert.match(html, /href="\.\.\/bridal-hair-makeup-pricing-calculator\/"/);
});
