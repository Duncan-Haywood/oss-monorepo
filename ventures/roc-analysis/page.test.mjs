import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const NETWORK = /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts|import\(/;

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not medical, legal, tax, or financial advice/);
  assert.match(html, /it is not a medical device/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with the authors of the cited papers/);
  assert.match(html, /CC BY 4\.0/);
  assert.match(html, /doi:10\.24432\/C5DW2B/);
});

test("JSON-LD blocks parse and the FAQ matches the page", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]["@type"], "SoftwareApplication");
  assert.equal(blocks[0].offers.price, "0");
  assert.equal(blocks[1]["@type"], "FAQPage");
  assert.ok(blocks[1].mainEntity.length >= 5);
  const text = html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");
  for (const q of blocks[1].mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(text.includes(q.acceptedAnswer.text), `answer to "${q.name}" is not shown on the page`);
  }
  assert.doesNotMatch(html, /AggregateRating|"Review"/);
});

test("SEO basics, in a searcher's words", () => {
  const html = page("index.html");
  assert.match(html, /<title>ROC Curve and AUC Calculator — DeLong test/);
  assert.match(html, /<meta name="description" content="Free online ROC analysis[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<meta name="viewport" content="width=device-width,initial-scale=1">/);
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  assert.match(html, /<html lang="en">/);
});

test("every input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]).filter((t) => !t.includes("${"));
  assert.ok(inputs.length >= 10);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(/aria-label=/.test(tag) || (id && new RegExp(`<label[^>]*\\sfor="${id}"`).test(html)), `unlabelled: ${tag}`);
  }
  assert.doesNotMatch(html, NETWORK);
  for (const f of ["engine.mjs", "usage.mjs", "cli.mjs"]) assert.doesNotMatch(page(f), NETWORK, f);
  assert.doesNotMatch(html, /<form[^>]+action=/i);
  assert.doesNotMatch(html, /<(script|link|img)[^>]+(src|href)=["']https?:/);
});

test("the page imports only what the engine exports", async () => {
  const html = page("index.html");
  const engine = await import("./engine.mjs");
  const names = html.match(/import \{([^}]+)\} from "\.\/engine\.mjs"/)[1].split(",").map((s) => s.trim());
  for (const n of names) assert.ok(n in engine, n);
});

test("the numbers the page states are the engine's", async () => {
  const { analyze } = await import("./engine.mjs");
  const r = analyze({ csv: page("data/wdbc-markers.csv"), resamples: 0 });
  const html = page("index.html");
  const pair = r.comparison.pairs.find((p) => p.a === "worst_concave_points" && p.b === "worst_perimeter");
  assert.equal(pair.p.toFixed(2), "0.24");
  assert.match(html, /AUCs of 0\.967 and 0\.975 cannot be told apart \(p = 0\.24\)/);
  assert.equal(r.results[0].auc.toFixed(3), "0.967");
  assert.equal(r.results[1].auc.toFixed(3), "0.975");
  for (const p of r.comparison.pairs.filter((q) => q.b === "cv_probability" && /worst/.test(q.a))) assert.ok(p.p < 0.001, p.a);
  assert.match(html, /the AUC is 0\.8932, the 0\.893 the paper reports/);
});
