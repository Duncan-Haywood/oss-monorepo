import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

test("index keeps its liability disclaimer and its no-upload promise", () => {
  assert.match(html, /No warranty/i);
  assert.match(html, /never uploaded/i);
  assert.match(html, /responsible for reviewing and verifying its output/i);
});

test("the page says plainly that it never submits or interviews as the user", () => {
  assert.match(html, /never submits for you and never pretends to be you/);
  assert.match(html, /Will it take interviews for me\?[\s\S]*?No\./);
});

test("every usage event the page records is disclosed in the footer", () => {
  const recorded = [...html.matchAll(/record\("([a-z_]+)"\)/g)].map((m) => m[1]);
  assert.ok(recorded.length >= 6);
  for (const e of new Set(recorded)) assert.ok(html.includes(`<code>${e}</code>`), `${e} is recorded but not disclosed`);
});

test("user-entered and model text is escaped before it reaches innerHTML", () => {
  assert.match(html, /const esc = /);
  for (const m of html.matchAll(/innerHTML = ([^;]+);/g)) {
    assert.doesNotMatch(m[1], /\$\{(r|it|post)\.(answer|question|title|body|note)\}/, `unescaped field in: ${m[1].slice(0, 80)}`);
  }
});

test("the page is wired to the tested core and the shared BYOK client, not copies of them", () => {
  assert.match(html, /from "\.\/engine\.mjs"/);
  assert.match(html, /from "\.\/byok\.mjs"/);
  assert.match(html, /from "\.\/usage\.mjs"/);
  assert.match(html, /checkDraft\(/, "AI drafts must go through the fabrication check");
});

test("the vendored BYOK client matches platform/llm", () => {
  const ours = readFileSync(new URL("./byok.mjs", import.meta.url), "utf8");
  const shared = readFileSync(new URL("../../platform/llm/byok.mjs", import.meta.url), "utf8");
  assert.equal(ours, shared);
});

test("index links one hop to its job-search siblings", () => {
  for (const s of ["job-application-tracker", "ats-resume-checker", "job-offer-total-comp-calculator"]) {
    assert.ok(html.includes(`href="../${s}/"`), `${s} not linked`);
  }
});
