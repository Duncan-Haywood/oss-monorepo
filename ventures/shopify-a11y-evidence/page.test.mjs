import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildReport, compareReports } from "./calc.mjs";

function textareaValue(html, id) {
  const match = html.match(new RegExp(`<textarea id="${id}"[^>]*>([\\s\\S]*?)</textarea>`));
  assert.ok(match, `expected #${id} sample JSON in index.html`);
  return match[1];
}

test("sample pastes in the page produce a useful comparison", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const after = buildReport(JSON.parse(textareaValue(html, "after")), "2026-08-25");
  const before = buildReport(JSON.parse(textareaValue(html, "before")), "2026-07-01");
  const comparison = compareReports(before, after);
  assert.ok(comparison.counts.resolved >= 1, "sample should show at least one resolved rule");
  assert.ok(comparison.counts.introduced >= 1, "sample should show at least one new rule");
  assert.ok(comparison.remaining.some((item) => item.id === "color-contrast"));
  assert.match(html, /Compare before → after/);
  assert.match(html, /not a compliance determination/i);
  assert.match(html, /github.com\/sponsors\/Duncan-Haywood/);
});
