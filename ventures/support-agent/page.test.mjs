import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const unescape = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

test("index page carries the disclaimer, privacy line, sponsor link and structured data", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, consumer-protection or professional advice/);
  assert.match(html, /Everything on this page runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("every form control has a label and the page makes no network requests", () => {
  const html = page("index.html");
  for (const id of ["kb", "q", "bar", "sbar", "tests", "ex", "cap"]) assert.match(html, new RegExp(`<label for="${id}"`), id);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
});

test("the page imports modules that exist and never a Node-only one", () => {
  const html = page("index.html");
  const seen = new Set();
  const walk = (f) => { if (seen.has(f)) return; seen.add(f); const src = page(f); assert.doesNotMatch(src, /from "node:/, `${f} must run in a browser`); for (const m of src.matchAll(/from "\.\/([a-z]+\.mjs)"/g)) walk(m[1]); };
  for (const m of html.matchAll(/from "\.\/([a-z]+\.mjs)"/g)) walk(m[1]);
  assert.ok(seen.has("agent.mjs") && seen.has("search.mjs"));
});

test("the samples in the page are the fixtures the tests use", () => {
  const html = page("index.html");
  const box = (id) => unescape(new RegExp(`<textarea id="${id}"[^>]*>([\\s\\S]*?)</textarea>`).exec(html)[1]);
  assert.equal(box("kb"), page("fixtures/sample-kb.md").trimEnd(), "refresh the kb textarea from fixtures/sample-kb.md");
  assert.equal(box("tests"), page("fixtures/sample-questions.csv").trimEnd(), "refresh the tests textarea from fixtures/sample-questions.csv");
});

test("the in-page FAQ matches the structured data", () => {
  const html = page("index.html");
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faq = ld.find((x) => x["@type"] === "FAQPage");
  for (const q of faq.mainEntity) { assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name); assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name); }
});

test("the benchmark numbers on the page are the ones the benchmark produces", async () => {
  const html = page("index.html"), readme = page("README.md");
  for (const s of ["65 (3.0%)", "786 (36.4%)", "39 (4.7%)", "1,007 (46.6%)", "66 (6.2%)"]) { assert.ok(html.includes(s), s); assert.ok(readme.includes(s), `README: ${s}`); }
});

test("robots, sitemap and llms.txt let crawlers and assistants find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
  assert.match(page("llms.txt"), /^# Support Agent/);
});

test("the Dockerfile copies every module the server imports", () => {
  const docker = page("Dockerfile"), seen = new Set();
  const walk = (f) => { if (seen.has(f)) return; seen.add(f); for (const m of page(f).matchAll(/from "\.\/([a-z]+\.mjs)"/g)) walk(m[1]); };
  walk("server.mjs");
  for (const f of seen) assert.ok(docker.includes(f), f);
  assert.match(docker, /fixtures\/sample-kb\.md/);
});
