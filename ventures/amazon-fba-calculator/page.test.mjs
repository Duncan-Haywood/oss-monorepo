// Structural tests for index.html.
//
// calc.test.mjs imports calc.mjs directly and never looks at the page, so it
// stays green if the Individual vs Professional table is missing, misaligned,
// or never wired to compareSellerPlans. Kept dependency-free (no jsdom).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const landing = readFileSync(new URL("./individual-vs-professional.html", import.meta.url), "utf8");

function parse(source) {
  const RAW = /<(textarea|script|style)\b[^>]*>/i;
  let rest = source;
  let markup = "";
  const scripts = [];
  for (;;) {
    const open = rest.match(RAW);
    if (!open) return { markup: markup + rest, scripts, unclosed: null };
    const tag = open[1].toLowerCase();
    const contentStart = open.index + open[0].length;
    markup += rest.slice(0, contentStart);
    const closer = new RegExp(`</${tag}\\s*>`, "i").exec(rest.slice(contentStart));
    if (!closer) return { markup, scripts, unclosed: tag };
    if (tag === "script") scripts.push(rest.slice(contentStart, contentStart + closer.index));
    markup += closer[0];
    rest = rest.slice(contentStart + closer.index + closer[0].length);
  }
}

const { markup, scripts, unclosed } = parse(html);
const scriptSource = scripts.join("\n");

test("page markup is well-formed enough to keep script templates out of the table", () => {
  assert.equal(unclosed, null);
});

test("page renders Individual vs Professional columns that match the row template", () => {
  assert.match(markup, /id="planCompare"/);
  assert.match(markup, /id="planVerdict"/);
  assert.match(markup, /id="individualPerUnit"/);
  assert.match(markup, /<th>Account<\/th><th>Fee \/ unit<\/th><th>Profit<\/th><th>Max buy<\/th>/);
  assert.match(scriptSource, /compareSellerPlans/);
  assert.match(scriptSource, /seller_plan_compared/);
  const rowTemplate = scriptSource.match(
    /`?<tr><td>\$\{name\}<\/td><td>\$\{money\(fee\)\}<\/td><td>\$\{money\(path\.profit\)\}<\/td><td>\$\{money\(path\.breakEvenBuyCost\)\}<\/td><\/tr>`?/,
  );
  assert.ok(rowTemplate, "plan-compare row must emit four cells in thead order");
});

test("page advertises the seller-plan comparison in machine-readable copy", () => {
  assert.match(html, /Individual vs Professional seller plan/);
  assert.match(markup, /individual-vs-professional\.html/);
  assert.match(markup, /Best-effort hosting, no SLA/);
});

test("SEO landing states the break-even rule and links back to the calculator", () => {
  assert.match(landing, /40\.4 units a month/);
  assert.match(landing, /href="\.\/"/);
  assert.match(landing, /No warranty/);
  assert.match(landing, /no SLA/);
});
