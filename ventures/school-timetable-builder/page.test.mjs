import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("both pages carry the disclaimer, privacy line and sponsor link", () => {
  for (const name of ["index.html", "free-school-timetable-generator.html"]) {
    const html = page(name);
    assert.match(html, /No warranty/, name);
    assert.match(html, /not professional advice/, name);
    assert.match(html, /nothing you type is uploaded|what you type is not uploaded/, name);
    assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/, name);
    assert.match(html, /<link rel="canonical"/, name);
  }
  assert.match(page("free-school-timetable-generator.html"), /not affiliated/);
});

test("the page only fetches its own sample and never sends data anywhere", () => {
  const html = page("index.html");
  for (const m of html.matchAll(/fetch\(([^)]*)\)/g)) assert.match(m[1], /^"samples\//, m[1]);
  assert.doesNotMatch(html, /XMLHttpRequest|sendBeacon|https?:\/\/[^"]*\.(js|mjs)"/);
});

test("the page and worker import modules that exist and never a Node-only one", () => {
  const seen = new Set();
  const walk = (name) => {
    if (seen.has(name)) return;
    seen.add(name);
    const src = page(name);
    assert.doesNotMatch(src, /from "node:/, `${name} must run in a browser`);
    for (const m of src.matchAll(/from "\.\/([a-z0-9-]+\.mjs)"/g)) walk(m[1]);
  };
  for (const m of page("index.html").matchAll(/from "\.\/([a-z0-9-]+\.mjs)"/g)) walk(m[1]);
  walk("worker.mjs");
  assert.ok(seen.has("timetable.mjs") && seen.has("usage.mjs"));
  assert.match(page("index.html"), /new Worker\(new URL\("\.\/worker\.mjs"/);
});

test("the in-page FAQ matches the structured data", () => {
  const html = page("index.html");
  const ld = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faq = ld.find((x) => x["@type"] === "FAQPage");
  assert.equal(faq.mainEntity.length, 5);
  for (const q of faq.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name + " answer");
  }
});

test("the benchmark claim on the page matches the recorded benchmark", () => {
  const bench = page("eval/benchmark-2026-11-16.md");
  const rows = bench.split("\n").filter((l) => /^\d+ \| /.test(l)).map((l) => l.split(" | "));
  assert.equal(rows.length, 21);
  assert.ok(rows.every((r) => r[4] === "0" && r[8] === "true"));
  const classes = rows.map((r) => Number(r[0]));
  assert.equal(Math.min(...classes), 4);
  assert.equal(Math.max(...classes), 40);
  assert.ok(rows.every((r) => Number(r[3]) < 2500));
  assert.match(page("index.html"), /for 4 to 40 classes/);
});

test("the sample school on disk is the one the guide describes", () => {
  const sample = page("samples/small-secondary.txt");
  assert.match(sample, /teacher Lindqvist: off Fri/);
  assert.match(sample, /7A\+7B: PE \/ Garcia \/ 2 \/ double \/ gym/);
});

test("robots, sitemap and llms.txt exist and list the guide", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /free-school-timetable-generator\.html/);
  assert.match(page("llms.txt"), /timetable/i);
});

test("links its scheduling siblings", () => {
  const html = page("index.html");
  assert.ok(html.includes('href="../tutor-weekly-schedule-optimizer/"'));
  assert.ok(html.includes('href="../league-schedule-generator/"'));
});
