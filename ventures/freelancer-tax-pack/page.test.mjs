import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /no SLA/);
});

test("structured data parses and the FAQ in JSON-LD matches the visible FAQ", () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  const faq = blocks.find((b) => b["@type"] === "FAQPage");
  assert.ok(faq && faq.mainEntity.length >= 5);
  for (const q of faq.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
});

test("every form control has a label and nothing is sent anywhere", () => {
  const ids = [...html.matchAll(/<(?:input|select|textarea)[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 18);
  for (const id of ids) {
    if (id === "s-qbi") continue; // wrapped in its own <label>
    assert.match(html, new RegExp(`<label for="${id}"`), id);
  }
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("storage reads are limited to the three sibling tools and this tool's own settings", () => {
  const keys = [...html.matchAll(/"((?:invoice-maker|expense-tracker|mileage-log|freelancer-tax-pack)[a-z0-9-]*)"/g)].map((m) => m[1]).filter((k) => !k.endsWith("-usage"));
  assert.deepEqual([...new Set(keys)].sort(), ["expense-tracker-data", "freelancer-tax-pack-settings", "invoice-maker-data", "mileage-log-data-v1"].sort());
  assert.doesNotMatch(html, /setItem\("(invoice-maker|expense-tracker|mileage-log)/);
});

test("user-typed text is escaped before it reaches innerHTML", () => {
  assert.match(html, /const esc = /);
  const script = html.slice(html.indexOf('<script type="module">'));
  // client names, labels and notes come from other tools' data: each must pass through esc()/money()
  for (const needle of ["esc(c.client)", "r.label)", "esc(n.text)", "esc(name)"]) assert.ok(script.includes(needle), needle);
  assert.doesNotMatch(script, /\$\{\s*(?:c\.client|r\.label|n\.text|inv\.clientName)\s*\}/);
});
