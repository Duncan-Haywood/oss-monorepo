import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

test("index keeps its liability disclaimer and its no-upload promise", () => {
  assert.match(html, /No warranty/i);
  assert.match(html, /never uploaded/i);
});

test("every usage event the page records is disclosed in the footer", () => {
  const recorded = [...html.matchAll(/record\("([a-z_]+)"\)/g)].map((m) => m[1]);
  assert.ok(recorded.length >= 4);
  for (const e of new Set(recorded)) assert.ok(html.includes(`<code>${e}</code>`), `${e} is recorded but not disclosed`);
});

test("user-entered text is escaped before it reaches innerHTML", () => {
  assert.match(html, /const esc = /);
  assert.match(html, /safeLink/, "posting links must be restricted to http(s)");
});

test("the page is wired to the tested core, not a copy of it", () => {
  assert.match(html, /from "\.\/tracker\.mjs"/);
  assert.match(html, /from "\.\/usage\.mjs"/);
});

test("guides are linked and listed in the sitemap", () => {
  const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");
  for (const p of ["when-to-follow-up-on-a-job-application.html", "vs-a-spreadsheet.html"]) {
    assert.ok(html.includes(`href="${p}"`), `${p} not linked from index`);
    assert.ok(sitemap.includes(p), `${p} not in sitemap`);
  }
});

test("index links one hop to the ats-resume-checker sibling", () => {
  assert.match(html, /href="\.\.\/ats-resume-checker\/"/);
});

test("index links one hop to the job-search-agent sibling", () => {
  assert.match(html, /href="\.\.\/job-search-agent\/"/);
});
