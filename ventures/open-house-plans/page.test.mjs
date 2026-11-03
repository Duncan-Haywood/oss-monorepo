import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const html = page("index.html");

test("the page carries the disclaimer, not-for-construction notice, privacy line and sponsor link", () => {
  assert.match(html, /No warranty\./);
  assert.match(html, /not architectural, engineering, construction, legal or financial advice/);
  assert.match(html, /Not for construction\./);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /CC0 1\.0/);
});

test("JSON-LD parses and the FAQ answers are on the page", () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks[0]["@type"], "SoftwareApplication");
  assert.equal(blocks[0].offers.price, "0");
  assert.equal(blocks[1]["@type"], "FAQPage");
  assert.ok(blocks[1].mainEntity.length >= 6);
  for (const q of blocks[1].mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(q.acceptedAnswer.text), `answer for ${q.name}`);
  }
});

test("SEO basics", () => {
  assert.match(html, /<title>Free House Plan Generator/);
  assert.match(html, /<meta name="description" content="[^"]{120,}"/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.equal((html.match(/<h1>/g) || []).length, 1);
});

test("every control has a label and nothing is sent anywhere", () => {
  const controls = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(controls.length >= 18);
  for (const tag of controls) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(id && html.includes(`<label for="${id}"`), `unlabelled: ${tag}`);
  }
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/);
  for (const f of readdirSync(new URL(".", import.meta.url)).filter((n) => n.endsWith(".mjs") && !n.endsWith(".test.mjs") && n !== "cli.mjs" && n !== "build-catalogue.mjs" && n !== "vendor-framing.mjs")) {
    assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|\bimport\(/, f);
  }
});

test("module scripts import only local files, and every engine module imports only siblings", () => {
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./catalogue-data.mjs", "./engine.mjs", "./usage.mjs", "./zip.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
  for (const f of readdirSync(new URL(".", import.meta.url)).filter((n) => n.endsWith(".mjs") && !n.endsWith(".test.mjs") && n !== "cli.mjs" && n !== "build-catalogue.mjs" && n !== "vendor-framing.mjs")) {
    for (const m of page(f).matchAll(/^import .* from "([^"]+)";$/gm)) assert.match(m[1], /^\.\/[\w-]+\.mjs$/, `${f} imports ${m[1]}`);
  }
  const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(src.replace(/^\s*import .*$/gm, "")));
});
