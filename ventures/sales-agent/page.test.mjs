import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { score } from "./eval/run.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const load = (f) => page(`eval/${f}`).split("\n").filter(Boolean).map((l) => JSON.parse(l));

test("index page carries the disclaimer, privacy line, sponsor link and the never-sends promise", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax or sales-compliance advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /may always do less on its own; it may never do more without you/);
  assert.match(html, /SENDS NOTHING/);
});

test("JSON-LD parses and every FAQ question and answer is on the page", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  const faq = blocks.find((b) => b["@type"] === "FAQPage");
  assert.ok(faq && faq.mainEntity.length >= 3);
  for (const q of faq.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  assert.equal(blocks[0]["@type"], "SoftwareApplication");
  assert.equal(blocks[0].offers.price, "0");
});

test("the accuracy the page states is what the eval measures", () => {
  const html = page("index.html");
  const s = score(load("fresh-2026-10-21.jsonl"));
  const unsub = load("fresh-2026-10-21.jsonl").filter((r) => r.label === "unsubscribe").length;
  assert.ok(html.includes(`${s.acted} of ${s.n}; right on ${s.actedRight} (${Math.round(100 * s.precision)}%)`));
  assert.ok(html.includes(`${s.n - s.acted}; the word model's guess was right on ${s.guessRight}`));
  assert.ok(html.includes(`${unsub - s.unsubMissed} of ${unsub} (the other ${s.unsubMissed}`));
  assert.ok(html.includes(`${s.guessOverreach} of ${s.n - s.acted} (guesses never act`));
  assert.ok(html.includes(`named a category for ${s.acted} and were right on ${s.actedRight}`));
});

test("SEO basics", () => {
  const html = page("index.html");
  assert.match(html, /<title>Sales Agent/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /AI sales agent/i);
});

test("every input has a label, and no page code sends data anywhere itself", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 10);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(/aria-label=/.test(tag) || (id && new RegExp(`<label[^>]*for="${id}"`).test(html)), `unlabelled: ${tag}`);
  }
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/);
  for (const f of ["engine.mjs", "learn.mjs", "model.mjs", "usage.mjs"]) assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/, f);
  assert.doesNotMatch(html, /<form[^>]+action=/i);
});

test("the engine has no send path", () => {
  for (const f of ["engine.mjs", "ai.mjs", "cli.mjs"]) assert.doesNotMatch(page(f), /nodemailer|smtp|sendmail|createTransport|twilio/i, f);
});
