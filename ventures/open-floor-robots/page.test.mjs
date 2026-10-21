import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, sponsor link and status", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not engineering, electrical or safety advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /Nothing you type or draw is uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with any robot vacuum maker/);
  assert.match(html, /no robot has been built yet/i);
});

test("JSON-LD parses and the FAQ matches the visible questions", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks[0]["@type"], "SoftwareApplication");
  assert.equal(blocks[0].offers.price, "0");
  assert.equal(blocks[1]["@type"], "FAQPage");
  assert.ok(blocks[1].mainEntity.length >= 6);
  for (const q of blocks[1].mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), `answer for: ${q.name}`);
  }
});

test("SEO basics", () => {
  const html = page("index.html");
  assert.match(html, /<title>Open Floor Robots — build your own robot vacuum, robot mop/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<html lang="en">/);
  assert.equal((html.match(/<h1>/g) || []).length, 1);
});

test("the results tables quote what the CLI printed, and the README agrees", () => {
  const html = page("index.html");
  const readme = page("README.md");
  for (const n of ["99.7%", "95.5%", "99.4%", "77.0%", "79.8%", "87.0%", "86.6%", "88.2%", "71.0%", "73.9%"]) {
    assert.ok(html.includes(`>${n}<`), `page: ${n}`);
    assert.ok(readme.includes(n), `README: ${n}`);
  }
});

test("every input is labelled and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 6);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(/aria-label=/.test(tag) || (id && html.includes(`for="${id}"`)), `unlabelled: ${tag}`);
  }
  for (const f of ["index.html", "sim.mjs", "usage.mjs"]) {
    assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/, f);
  }
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
  assert.doesNotMatch(html, /<img[^>]+src=["']https?:/, "no third-party image requests");
});

test("module script imports only local files and parses", () => {
  const html = page("index.html");
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./sim.mjs", "./usage.mjs"]);
  const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(src.replace(/^\s*import .*$/gm, "")));
});

test("the manufacturing packages the page offers are committed next to it", () => {
  const html = page("index.html");
  for (const v of ["vacuum", "mop", "combo"]) {
    // Absolute: the apex mirror serves only pages and scripts.
    assert.match(html, new RegExp(`href="https://github\\.com/duncan-haywood/oss-monorepo/raw/main/ventures/open-floor-robots/manufacturing/${v}-package\\.zip"`));
    assert.ok(existsSync(new URL(`./manufacturing/${v}-package.zip`, import.meta.url)), v);
    assert.ok(existsSync(new URL(`./manufacturing/${v}/bom.csv`, import.meta.url)), v);
  }
});

// One-hop sibling links (platform/pages/siblings.mjs): the other open-hardware pages.
test("index links one hop to the mower and tennis sibling pages", () => {
  const html = page("index.html");
  assert.match(html, /href="\.\.\/open-robot-mower\/"/);
  assert.match(html, /href="\.\.\/open-tennis-robots\/"/);
});
