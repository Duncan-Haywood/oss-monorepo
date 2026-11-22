import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkConfigText } from "./check.mjs";

const page = (n) => readFileSync(new URL(`./${n}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, not-affiliated line and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /Not affiliated with or endorsed by/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("every element id the page script looks up exists", () => {
  const html = page("index.html");
  for (const id of ["config", "status", "report-card", "verdict", "rows", "first", "check", "load-example", "clear", "optout"]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }
});

test("the worked example produces every finding its caption promises", () => {
  const html = page("index.html");
  const cfg = /const EXAMPLE_CONFIG = `([^`]*)`/.exec(html)[1];
  const r = checkConfigText(cfg);
  const rules = r.findings.map((f) => f.rule);
  assert.equal(r.ok, false);
  for (const rule of ["wrong-type", "bad-regex", "mutable-rev", "unknown-hook-key", "args-glued", "legacy-stage"]) assert.ok(rules.includes(rule), rule);
  assert.equal(r.findings.filter((f) => f.rule === "wrong-type").length, 2, "100 and 3.11");
  assert.match(r.findings.find((f) => f.rule === "unknown-hook-key").message, /exclude_types/);
});

test("the FAQ schema repeats the visible FAQ", () => {
  const html = page("index.html");
  const ld = JSON.parse(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema.org","@type":"FAQPage".*?)<\/script>/s.exec(html)[1]);
  for (const q of ld.mainEntity) {
    const visible = q.name.replace(/"/g, "&quot;").replace(/\*\.py/, "<code>*.py</code>");
    assert.ok(html.includes(q.name.split(" ").slice(0, 4).join(" ")) || html.includes(visible), q.name);
  }
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});
