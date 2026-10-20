import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { parseTransactions, overview, SAMPLE_CSV } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with HMRC/);
});

test("JSON-LD blocks parse and describe a free application and a FAQ", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]["@type"], "SoftwareApplication");
  assert.equal(blocks[0].offers.price, "0");
  assert.equal(blocks[1]["@type"], "FAQPage");
  assert.ok(blocks[1].mainEntity.length >= 6);
  for (const q of blocks[1].mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("SEO basics on every page", () => {
  for (const f of readdirSync(new URL(".", import.meta.url)).filter((n) => n.endsWith(".html"))) {
    const html = page(f);
    assert.match(html, /<title>[^<]{20,}/, f);
    assert.match(html, /<meta name="description" content="[^"]{80,}/, f);
    assert.match(html, new RegExp(`<link rel="canonical" href="\\./${f}">`), f);
    assert.match(html, /<h1>/, f);
    assert.match(html, /<html lang="en">/, f);
    assert.match(html, /No warranty/, f);
  }
  assert.match(page("index.html"), /<meta property="og:title"/);
  const sitemap = page("sitemap.xml");
  for (const f of readdirSync(new URL(".", import.meta.url)).filter((n) => n.endsWith(".html"))) assert.ok(sitemap.includes(`./${f}`), `${f} missing from sitemap`);
});

test("every input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 4);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(/aria-label=/.test(tag) || (id && html.includes(`<label for="${id}">`)), `unlabelled: ${tag}`);
  }
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|import\(/);
  assert.doesNotMatch(page("usage.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
  assert.doesNotMatch(html, /<form[^>]+action=/i);
});

test("the module scripts import only local files, and the inline script parses", () => {
  const html = page("index.html");
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
  assert.doesNotMatch(page("calc.mjs"), /^\s*import\s/m);
  const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(src.replace(/^\s*import .*$/gm, "")));
});

test("the guide's worked figures are what the engine computes", () => {
  const guide = page("section-104-pooling-crypto-worked-example.html");
  const o = overview(parseTransactions(SAMPLE_CSV).transactions);
  const btc = o.disposals.filter((d) => d.asset === "BTC");
  const fmt = (n) => n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const loss = btc.find((d) => d.rule === "same-day");
  assert.ok(guide.includes(`loss of £${fmt(-loss.gain)}`));
  const thirty = btc.find((d) => d.rule === "30-day");
  assert.ok(guide.includes(`a gain of £${fmt(thirty.gain)}`));
  const gains = btc.reduce((s, d) => s + Math.max(0, d.gain), 0);
  assert.ok(guide.includes(`gains of £${fmt(gains)}`));
  assert.ok(guide.includes(`£${fmt(o.pools.BTC.cost)}`));
});
