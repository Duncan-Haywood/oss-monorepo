import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const page = (n) => readFileSync(new URL(`./${n}`, import.meta.url), "utf8");

test("pages carry the disclaimer, privacy line and sponsor link", () => {
  for (const f of ["index.html", "missed-call-text-back-for-contractors.html"]) {
    const h = page(f);
    assert.match(h, /No warranty/); assert.match(h, /not legal, tax, accounting, compliance, or financial advice/);
    assert.match(h, /github\.com\/sponsors\/Duncan-Haywood/);
  }
  assert.match(page("index.html"), /FAQPage/);
});
test("every input has a label and the page never sends data anywhere", () => {
  const h = page("index.html");
  for (const id of ["missed", "already", "reply", "close", "job", "cost", "biz", "link", "tz", "when", "tmpl"]) assert.match(h, new RegExp(`<label for="${id}">`));
  assert.doesNotMatch(h, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
  assert.doesNotMatch(page("engine.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|node:/);
  assert.deepEqual([...h.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./engine.mjs", "./usage.mjs"]);
});
test("marketing claims are ones the files back: no testimonials, ratings or user counts", () => {
  for (const f of ["index.html", "missed-call-text-back-for-contractors.html", "README.md", "llms.txt"]) assert.doesNotMatch(page(f), /testimonial|★|\b\d+,?\d* (happy )?(customers|users)\b|5-star/i);
});
test("the page says it has only been tested against a fake Twilio", () => {
  assert.match(page("index.html"), /Tested with a fake Twilio only/);
});
