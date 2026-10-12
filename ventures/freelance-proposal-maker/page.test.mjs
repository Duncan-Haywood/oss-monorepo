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
  const ids = [...html.matchAll(/<(?:input|select|textarea) id="(f-[A-Za-z]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 17);
  for (const id of ids) {
    const wrapped = new RegExp(`<label[^>]*>[^<]*<input id="${id}"`).test(html);
    assert.ok(wrapped || new RegExp(`<label for="${id}"`).test(html), id);
  }
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
});

test("the proposal is rendered with textContent, and innerHTML only ever gets escaped values", () => {
  const html = page("index.html");
  assert.match(html, /const esc = /);
  assert.match(html, /p\.textContent = para/);
  const script = html.slice(html.indexOf('<script type="module">'));
  const stmts = script.split(/\.innerHTML\s*=/).slice(1).map((t) => t.slice(0, t.search(/;\n/)));
  assert.ok(stmts.length >= 3);
  const raw = stmts.flatMap((t) => [...t.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1])).filter((x) => !/^esc\(/.test(x.trim()));
  assert.deepEqual(raw, []);
});

test("every form field the page reads exists in the defaults, and the reverse", async () => {
  const { DEFAULTS } = await import("./calc.mjs");
  const html = page("index.html");
  const listed = [...html.match(/const TEXT = \[(.*?)\];/s)[1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
    assert.deepEqual([...listed].sort(), Object.keys(DEFAULTS).sort());
});

test("page states the storage caveat and its limits", () => {
  const html = page("index.html");
  assert.match(html, /Clearing site data removes them/);
  assert.match(html, /Not modelled/);
  assert.match(html, /not by a model/);
});

test("footer links the siblings that exist", () => {
  const html = page("index.html");
  for (const s of ["freelance-contract-maker", "freelance-contract-checker", "estimate-maker", "time-tracker", "invoice-maker", "freelance-dashboard"]) {
    assert.match(html, new RegExp(`href="\\.\\./${s}/"`), s);
  }
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("the proposal prints by itself and records local events only", () => {
  const html = page("index.html");
  assert.match(html, /id="doc-card"/);
  assert.match(html, /@media print/);
  assert.match(html, /proposal_printed/);
});

test("the hours estimate and target rate are labelled private on the page", () => {
  const html = page("index.html");
  assert.match(html, /target hourly rate \(private, never printed\)/);
  assert.match(html, /Your rate \(private\)/);
});
