import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const html = read("index.html");
const guide = read("fix-ollama-cors-error.html");
const sitemap = read("sitemap.xml");

const scriptSource = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
const jsonLd = (source) => [...source.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

test("structured data parses, and the FAQ matches the visible questions", () => {
  const blocks = jsonLd(html);
  const faq = blocks.find((b) => b["@type"] === "FAQPage");
  assert.ok(blocks.find((b) => b["@type"] === "SoftwareApplication"));
  for (const q of faq.mainEntity) assert.ok(html.includes(`<h3>${q.name.replace(/OLLAMA_ORIGINS/, "OLLAMA_ORIGINS")}</h3>`), q.name);
  assert.ok(jsonLd(guide).find((b) => b["@type"] === "HowTo"));
});

test("the page wires the probe, the fixes, the test prompt and the usage counter", () => {
  for (const name of ["probeAll", "fixFor", "testPrompt", "reportText", "complete"]) assert.match(scriptSource, new RegExp(`\\b${name}\\b`));
  for (const event of ["probe_run", "test_prompt_run", "fix_copied"]) assert.match(scriptSource, new RegExp(`countUsage\\("${event}"\\)`));
  assert.match(scriptSource, /pageProtocol: location\.protocol/);
});

test("model output and server data are written as text, never as markup", () => {
  assert.doesNotMatch(scriptSource, /innerHTML/);
});

test("probing waits for a click, so the browser's local-network prompt follows a user action", () => {
  assert.match(scriptSource, /\$\("probeBtn"\)\.addEventListener\("click"/);
  assert.doesNotMatch(scriptSource.split('$("probeBtn")')[0], /probeAll\(/);
});

test("disclaimer, privacy, hosting, sponsor and usage opt-out are on the page", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /<strong>Privacy\.<\/strong>/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /id="usage"/);
  assert.match(html, /Do Not Track and Global Privacy Control disable counting/);
  assert.match(guide, /<strong>No warranty\.<\/strong>/);
});

test("links to the tools that can use a local model, and to the guide", () => {
  for (const slug of ["proposal-maker", "review-reply-desk", "sales-call-notes-desk", "icp-lens", "ats-resume-checker"]) {
    assert.match(html, new RegExp(`href="\\.\\./${slug}/"`));
  }
  assert.match(html, /href="\.\/fix-ollama-cors-error\.html"/);
  assert.match(sitemap, /fix-ollama-cors-error\.html/);
});

test("the guide never recommends a wildcard origin", () => {
  assert.doesNotMatch(guide, /OLLAMA_ORIGINS=["']?\*/);
  assert.match(guide, /Avoid <code>\*<\/code>/);
});
