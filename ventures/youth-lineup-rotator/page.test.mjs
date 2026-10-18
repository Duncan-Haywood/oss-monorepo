import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseSlots, parsePlayers, buildLineup } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const GUIDE = "how-to-give-every-kid-equal-playing-time.html";

test("index page carries the disclaimer, privacy line and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, medical, safety or league-rules advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with any league/);
  assert.match(html, /Best-effort hosting, no SLA/);
});

test("JSON-LD parses and every FAQ question is on the page", () => {
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

test("SEO basics and sitemap", () => {
  for (const name of ["index.html", GUIDE]) {
    const html = page(name);
    assert.match(html, /<html lang="en">/);
    assert.match(html, /<title>[^<]{20,}/);
    assert.match(html, /<meta name="description" content="[^"]{80,}/);
    assert.match(html, /<link rel="canonical" href="\.\//);
    assert.match(html, /<h1>/);
  }
  assert.match(page("index.html"), /youth soccer lineup generator/i);
  assert.match(page("sitemap.xml"), new RegExp(GUIDE));
});

test("every static input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 8);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(/aria-label=/.test(tag) || (id && new RegExp(`<label[^>]*for="${id}"`).test(html)), `unlabelled: ${tag}`);
  }
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|import\(/);
  assert.doesNotMatch(html, /<form[^>]+action=/i);
});

test("every usage event the page records is declared in its footer", () => {
  const html = page("index.html");
  const used = new Set([...html.matchAll(/record\("([a-z_]+)"\)/g)].map((m) => m[1]));
  for (const m of html.matchAll(/make\("([a-z_]+)"\)/g)) used.add(m[1]);
  assert.ok(used.size >= 8);
  for (const e of used) assert.ok(html.includes(`<code>${e}</code>`), e);
});

test("the guide's table is the arithmetic, and the engine achieves it", () => {
  const html = page(GUIDE);
  const { slots } = parseSlots("GK, DEF x2, MID x2, FWD x2");
  for (let n = 8; n <= 14; n++) {
    const total = 7 * 4;
    const lo = Math.floor(total / n);
    const extra = total % n;
    const desc = extra === 0 ? `everyone plays ${lo}` : `${extra} play ${lo + 1}, ${n - extra} play ${lo}`;
    assert.ok(html.includes(`<tr><td>${n}</td><td>${n - 7}</td><td>${desc}</td></tr>`), `${n}: ${desc}`);
    const players = parsePlayers(Array.from({ length: n }, (_, i) => `P${i + 1}`).join("\n"), slots, 4).players;
    const r = buildLineup({ players, slotNames: slots, periods: 4, seed: 1 });
    const counts = r.stats.map((s) => s.played).sort((a, b) => a - b);
    assert.equal(counts[0], lo, `${n} players min`);
    assert.equal(counts[n - 1], extra === 0 ? lo : lo + 1, `${n} players max`);
  }
});
