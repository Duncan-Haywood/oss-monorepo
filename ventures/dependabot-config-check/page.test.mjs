import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze } from "./check.mjs";

const page = (n) => readFileSync(new URL(`./${n}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("every element id the page script looks up exists", () => {
  const html = page("index.html");
  for (const id of ["config", "files", "status", "report-card", "verdict", "rows", "gen-card", "gen-out", "check", "generate", "load-example", "clear", "copy", "optout"]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }
});

test("the worked example produces the findings its caption promises", () => {
  const html = page("index.html");
  const cfg = /const EXAMPLE_CONFIG = `([^`]*)`/.exec(html)[1];
  const files = /const EXAMPLE_FILES = `([^`]*)`/.exec(html)[1].split("\n");
  const rules = analyze(cfg, files).findings.map((f) => f.rule);
  for (const r of ["unknown-ecosystem", "uncovered-ecosystem", "pr-limit-zero", "no-groups"]) assert.ok(rules.includes(r), r);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});
