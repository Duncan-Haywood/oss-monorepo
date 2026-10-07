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

test("every form control has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  for (const id of ["rate", "paid", "restore"]) assert.match(html, new RegExp(`<label for="${id}"`), id);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
});

test("user-typed text is escaped before it reaches innerHTML", () => {
  const html = page("index.html");
  const script = html.slice(html.indexOf('<script type="module">'));
  const stmts = script.split(/\.innerHTML\s*=/).slice(1).map((t) => t.slice(0, t.search(/;\n/)));
  assert.ok(stmts.length >= 5);
  const safe = /^(esc\(|money\(|d\.actions\.map|d\.clients\.map|Object\.keys\(STORES\)\.map|a\.value|c\.effectiveRate|d\.present|due \?|d\.setAsideGap|due\.days ===|d\.pipeline\.open ===|d\.time\.unbilledHours ===|any \|\||rate|d\.pipeline|d\.time|d\.receivables|a\b|c\b|n\b|STORES|\(a\)|\(c\)|\(n\))/;
  const raw = stmts.flatMap((t) => [...t.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1])).filter((x) => !safe.test(x.trim()));
  assert.deepEqual(raw, []);
});

test("restore writes only the four known stores and asks first", () => {
  const html = page("index.html");
  assert.match(html, /confirm\(/);
  assert.match(html, /checkBackup/);
  assert.match(html, /Object\.entries\(r\.stores\)/);
});

test("page states what is not modelled and the sample-data promise", () => {
  const html = page("index.html");
  assert.match(html, /Not modelled/);
  assert.match(html, /never saved/);
});
