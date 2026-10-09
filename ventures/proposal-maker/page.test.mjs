import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("the clause text is flagged as not legal advice, next to the controls and in the footer", () => {
  const html = page("index.html");
  assert.match(html, /<strong>Not legal advice\.<\/strong>/);
  assert.match(html, /Have a lawyer review any contract/);
  const footer = html.slice(html.indexOf("<footer"));
  assert.match(footer, /generic template text, not legal advice/);
});

test("structured data parses and the FAQ in JSON-LD matches the visible FAQ", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  const faq = blocks.find((b) => b["@type"] === "FAQPage");
  assert.ok(faq && faq.mainEntity.length >= 5);
  for (const q of faq.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
});

test("every static form control has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const ids = [...html.matchAll(/<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]).filter((id) => !["import-file", "clients"].includes(id));
  assert.ok(ids.length > 30);
  for (const id of ids) assert.match(html, new RegExp(`<label[^>]*for="${id}"`), id);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("the page renders the proposal through calc.mjs and escapes what it builds itself", () => {
  const html = page("index.html");
  assert.match(html, /renderProposal\(p/);
  const script = html.slice(html.indexOf('<script type="module">'));
  // every ${...} that reaches innerHTML in the page script is escaped, a number, or a built-from-escaped fragment
  const dash = script.slice(script.indexOf("function renderDash"), script.indexOf("const download"));
  const raw = [...dash.matchAll(/\$\{(?!esc\(|money\(|act\.join|st\}|s\.open\}|s\.open === 1|s\.winRate === null|s\.sent\}|s\.accepted\})([^}]*)\}/g)].map((m) => m[1]);
  assert.deepEqual(raw, []);
  for (const fn of ["deliverableBlock", "phaseRow", "milestoneRow", "lineRow", "optionBlock"]) {
    const body = script.slice(script.indexOf(`function ${fn}`), script.indexOf("}\n", script.indexOf(`function ${fn}`)));
    const unescaped = [...body.matchAll(/\$\{(?!esc\()([^}]*)\}/g)].map((m) => m[1]);
    assert.deepEqual(unescaped, [], fn);
  }
});

test("page states the storage caveat, the model and its limits, and a print stylesheet", () => {
  const html = page("index.html");
  assert.match(html, /clearing browser data clears them/);
  assert.match(html, /Not modelled/);
  assert.match(html, /@media print/);
  assert.match(html, /good-better-best|Good, better, best/i);
  for (const m of ["fixed", "tiers", "hourly", "retainer"]) assert.match(html, new RegExp(`<option value="${m}">`));
});

test("handoff writes only to Estimate Maker's key, and the footer links the siblings that exist", () => {
  const html = page("index.html");
  assert.match(html, /"estimate-maker-data"/);
  assert.doesNotMatch(html, /"invoice-maker-data"/);
  for (const s of ["estimate-maker", "invoice-maker", "time-tracker", "freelance-dashboard", "freelance-contract-checker", "quote-margin-check"]) {
    assert.match(html, new RegExp(`href="\\.\\./${s}/"`), s);
  }
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});
