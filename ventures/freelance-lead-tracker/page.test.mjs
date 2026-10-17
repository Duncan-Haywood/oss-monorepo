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
  assert.ok(ids.length >= 11);
  for (const id of ids) assert.match(html, new RegExp(`<label for="${id}"`), id);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
});

test("user-typed text reaches innerHTML only through esc()", () => {
  const html = page("index.html");
  assert.match(html, /const esc = /);
  const script = html.slice(html.indexOf('<script type="module">'));
  assert.ok((script.match(/\.innerHTML\s*=/g) ?? []).length >= 6);
  // a typed field concatenated into markup without esc() would be script injection
  assert.doesNotMatch(script, /\+\s*(?:l|r|r\.lead|lead)\.(?:name|contact|source|notes|nextAction|lostReason|reason|id)\b/);
  assert.doesNotMatch(script, /<option>\$\{/);
});

test("page states the storage caveat and its limits", () => {
  const html = page("index.html");
  assert.match(html, /Clearing site data removes it/);
  assert.match(html, /Not modelled/);
  assert.match(html, /not a prediction of income/);
});

test("footer links the siblings that exist", () => {
  const html = page("index.html");
  for (const s of ["freelance-proposal-maker", "freelance-contract-maker", "estimate-maker", "time-tracker", "invoice-maker", "freelance-dashboard"]) {
    assert.match(html, new RegExp(`href="\\.\\./${s}/"`), s);
  }
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("the page imports only names calc.mjs exports", async () => {
  const calc = await import("./calc.mjs");
  const html = page("index.html");
  const names = html.match(/import \{([^}]*)\} from "\.\/calc\.mjs"/)[1].split(",").map((s) => s.trim());
  for (const n of names) assert.ok(n in calc, n);
});

test("usage events named in the footer are the ones the page records", () => {
  const html = page("index.html");
  const recorded = new Set([...html.matchAll(/record\("(\w+)"\)/g)].map((m) => m[1]));
  const listed = [...html.match(/Anonymous feature events \((.*?)\)/)[1].matchAll(/<code>(\w+)<\/code>/g)].map((m) => m[1]);
  assert.deepEqual([...recorded].sort(), listed.sort());
});
