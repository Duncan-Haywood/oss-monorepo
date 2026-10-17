import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /Everything on this page runs in your browser/);
  assert.match(html, /no uptime or delivery guarantee/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("every form control has a label and the page makes no network requests", () => {
  const html = page("index.html");
  for (const id of ["hours", "tz", "viewer", "len", "buf", "notice", "ics"]) assert.match(html, new RegExp(`<label for="${id}"`), id);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
});

test("the page imports modules that exist and never a Node-only one", () => {
  const html = page("index.html");
  for (const m of html.matchAll(/from "\.\/([a-z]+\.mjs)"/g)) {
    assert.doesNotThrow(() => page(m[1]), m[1]);
    assert.doesNotMatch(page(m[1]), /from "node:/, `${m[1]} must run in a browser`);
  }
});

test("the in-page FAQ matches the structured data", () => {
  const html = page("index.html");
  const ld = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faq = ld.find((x) => x["@type"] === "FAQPage");
  assert.ok(faq.mainEntity.length >= 5);
  for (const q of faq.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("the demo runs: the sample calendar blocks Monday and Wednesday 10:00 New York", async () => {
  const { parseHours, freeSlots, parseIcsBusy, zonedToUtc, fmtTime, dateKey } = await import("./slot.mjs");
  const html = page("index.html"), ics = /<textarea id="ics"[^>]*>([\s\S]*?)<\/textarea>/.exec(html)[1];
  const NY = "America/New_York", now = zonedToUtc(2026, 10, 19, 6, 0, NY);
  const busy = parseIcsBusy(ics, now, now + 8 * 86_400_000, NY);
  const day = (k) => freeSlots({ id: "d", minutes: 30, tz: NY, hours: parseHours("mon-fri 09:00-12:00").hours, horizonDays: 7, noticeMin: 0 }, busy, now).filter((s) => dateKey(s, NY) === k).map((s) => fmtTime(s, NY));
  assert.ok(!day("2026-10-19").includes("10:00 AM") && !day("2026-10-19").includes("10:30 AM"));
  assert.ok(day("2026-10-20").includes("10:00 AM"));
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("the Dockerfile copies every module the server imports", () => {
  const docker = page("Dockerfile");
  for (const f of ["server.mjs", "render.mjs", "book.mjs", "slot.mjs"]) { assert.ok(docker.includes(f), f); for (const m of page(f).matchAll(/from "\.\/([a-z]+\.mjs)"/g)) assert.ok(docker.includes(m[1]), m[1]); }
});
