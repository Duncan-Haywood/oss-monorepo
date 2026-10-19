import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not engineering or safety advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /Nothing you type is uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with any ball machine maker/);
  assert.match(html, /no robot has been built yet/i);
});

test("JSON-LD parses and the FAQ matches the visible questions", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks[0]["@type"], "SoftwareApplication");
  assert.equal(blocks[0].offers.price, "0");
  assert.equal(blocks[1]["@type"], "FAQPage");
  assert.ok(blocks[1].mainEntity.length >= 6);
  for (const q of blocks[1].mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("SEO basics", () => {
  const html = page("index.html");
  assert.match(html, /<title>Open Tennis Robots/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<html lang="en">/);
  assert.equal((html.match(/<h1>/g) || []).length, 1);
});

test("the study table is filled in, not a placeholder", () => {
  const html = page("index.html");
  assert.doesNotMatch(html, /STUDY_ROWS/);
  assert.doesNotMatch(page("README.md"), /STUDY_TABLE/);
  assert.ok((html.match(/<td class="n">\d+%<\/td>/g) || []).length >= 12);
});

test("every input is labelled and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 8);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(/aria-label=/.test(tag) || (id && html.includes(`for="${id}"`)), `unlabelled: ${tag}`);
  }
  for (const f of ["index.html", "sim.mjs", "usage.mjs"]) {
    assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/, f);
  }
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});

test("module script imports only local files and parses", () => {
  const html = page("index.html");
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./sim.mjs", "./usage.mjs"]);
  const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(src.replace(/^\s*import .*$/gm, "")));
});

// One-hop sibling link (platform/pages/siblings.mjs): the related-tool strip
// rotates and may never pair these two racquet-sport pages.
test("index links one hop to the pickleball-facility-pro-forma sibling", () => {
  assert.match(page("index.html"), /href="\.\.\/pickleball-facility-pro-forma\/"/);
});
