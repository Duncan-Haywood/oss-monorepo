import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const index = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const guide = readFileSync(new URL("./why-downloads-not-subscribers.html", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

test("index links to the downloads-vs-subscribers guide, and it is in the sitemap", () => {
  assert.match(index, /why-downloads-not-subscribers\.html/);
  assert.match(sitemap, /why-downloads-not-subscribers\.html/);
});

test("the guide states the IAB/Podtrac 7-day download window", () => {
  assert.match(guide, /IAB/);
  assert.match(guide, /7 days/);
  assert.match(guide, /Podtrac/);
});

test("the guide's worked example matches the calculator's own output for the 40,000-subscriber / 10,000-download case", async () => {
  const { computeRates } = await import("./calculator.mjs");
  const correct = computeRates({ downloads: 10000, niche: "business", readType: "host-read" });
  const wrong = computeRates({ downloads: 40000, niche: "business", readType: "host-read" });
  assert.equal(correct.rates.midroll.low, 300);
  assert.equal(correct.rates.midroll.high, 450);
  assert.equal(wrong.rates.midroll.low, 1200);
  assert.equal(wrong.rates.midroll.high, 1800);
  assert.match(guide, /\$300.{1,2}\$450/);
  assert.match(guide, /\$1,200.{1,2}\$1,800/);
  assert.match(guide, /4x overask/);
});

test("the guide carries a working FAQPage block whose questions are also rendered as visible copy", () => {
  const match = guide.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?)<\/script>/s);
  assert.ok(match, "expected a FAQPage JSON-LD block");
  const ld = JSON.parse(match[1]);
  assert.ok(ld.mainEntity.length >= 3);
  for (const entry of ld.mainEntity) {
    assert.ok(guide.includes(entry.name), `question not rendered as visible copy: ${entry.name}`);
    assert.ok(guide.includes(entry.acceptedAnswer.text), `answer not rendered as visible copy: ${entry.name}`);
  }
});

test("the guide never claims a network call, matching every other page in this venture", () => {
  assert.doesNotMatch(guide, /fetch\(|XMLHttpRequest|<script src=/);
});

test("the guide carries the standard no-warranty and best-effort-hosting disclaimers", () => {
  assert.match(guide, /No warranty/);
  assert.match(guide, /Best-effort hosting, no SLA/);
});

test("the guide links back to the tool with a share link carrying the worked example's inputs", () => {
  assert.match(guide, /href="\.\/"/);
  assert.match(guide, /href="\.\/\?downloads=10000&amp;niche=business&amp;readType=host-read"/);
});
