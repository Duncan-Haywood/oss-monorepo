import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readDenial, deadlines, appealLetter, sampleDenial } from "./engine.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not medical, legal, tax, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /health information/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("JSON-LD blocks parse and describe a free application and a FAQ that matches the markup", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]["@type"], "SoftwareApplication");
  assert.equal(blocks[0].offers.price, "0");
  assert.equal(blocks[1]["@type"], "FAQPage");
  assert.ok(blocks[1].mainEntity.length >= 5);
  for (const q of blocks[1].mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
});

test("SEO basics: title, description, canonical and Open Graph tags", () => {
  const html = page("index.html");
  assert.match(html, /<title>Insurance Denial Appeal Builder/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
});

test("every form control has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  for (const id of ["paste", "plan", "reason", "received", "days", "timing", "amount", "patient", "insurer", "memberId", "claimNumber", "serviceDate", "provider", "service", "phone", "why", "lateReason", "letter"]) assert.match(html, new RegExp(`<label for="${id}">`), id);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/);
  assert.doesNotMatch(page("engine.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|import\(/);
  assert.doesNotMatch(page("usage.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
  assert.doesNotMatch(html, /<form[^>]+action=/i);
});

test("the module scripts import only local files and the inline script parses", () => {
  const html = page("index.html");
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./engine.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
  const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(src.replace(/^\s*import .*$/gm, "")));
});

test("every id the script reads exists in the markup", () => {
  const html = page("index.html");
  const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  const ids = new Set([...src.matchAll(/\$\("#([A-Za-z-]+)"\)/g)].map((m) => m[1]));
  for (const id of ids) assert.match(html, new RegExp(`id="${id}"`), id);
});

test("the sample walks through the engine to a complete, honest letter", () => {
  const r = readDenial(sampleDenial());
  const d = deadlines({ plan: "commercial", received: r.noticeDate, today: "2026-10-02", statedDays: r.statedDays });
  assert.equal(d.status, "open");
  const letter = appealLetter({ plan: "commercial", reason: r.top, patient: "Alex Rivera", received: r.noticeDate, claimNumber: r.claimNumber, memberId: r.memberId, amount: 2480 });
  assert.match(letter, /ZXC123456789/);
  assert.match(letter, /not medically necessary|medical record/);
});

test("robots, sitemap and README exist and the README carries the disclaimer", () => {
  assert.match(page("robots.txt"), /User-agent: \*/);
  assert.match(page("sitemap.xml"), /index\.html/);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("README.md"), /health information/);
});
