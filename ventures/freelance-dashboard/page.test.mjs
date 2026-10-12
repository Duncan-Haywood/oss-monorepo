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
  assert.match(html, /<label for="rate"/);
  assert.match(html, /id="restore"[^>]*aria-label=/);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
});

test("user-typed text is escaped before it reaches innerHTML", () => {
  const html = page("index.html");
  assert.match(html, /const esc = /);
  const script = html.slice(html.indexOf('<script type="module">'));
  const stmts = script.split(/\.innerHTML\s*=/).slice(1).map((t) => t.slice(0, t.search(/;\n/)));
  assert.ok(stmts.length >= 5);
  const safe = /^(esc\(|MONTHS|TOOLS|o\.months|o\.actions|o\.receivables|o\.clientRows|r\.rate === null|k\.map|m\b|\[)/;
  const raw = stmts.flatMap((t) => [...t.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1])).filter((x) => !safe.test(x.trim()));
  // Everything interpolated must go through esc(), or be a number built from our own arithmetic.
  for (const x of raw) assert.match(x, /Math\.round\(|o\.pipeline\.open|\? "|r\.overdue|o\.actions/, x);
});

test("page states the storage caveat and what is not modelled", () => {
  const html = page("index.html");
  assert.match(html, /Clearing site data removes your data/);
  assert.match(html, /Not modelled/);
});

test("restore asks for confirmation before it overwrites a tool's data", () => {
  assert.match(page("index.html"), /confirm\(`Restoring replaces/);
});
