import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculateQuote } from "./calc.mjs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

test("every raw-text element is closed", () => {
  for (const tag of ["title", "h1", "p", "label", "button", "footer"]) {
    const open = html.split(`<${tag}`).length - 1;
    const close = html.split(`</${tag}>`).length - 1;
    assert.equal(open, close, `${tag} open/close mismatch`);
  }
});

test("disclaimers a user can actually read", () => {
  assert.match(html, /No warranty/i);
  assert.match(html, /not financial or business advice/i);
  assert.match(html, /GitHub Sponsors/);
});

test("worked example on the page matches the locked comparison", () => {
  const result = calculateQuote({
    diagnosticHours: 0.5,
    repairHours: 1.5,
    travelHours: 0.5,
    laborRate: 80,
    tripCost: 35,
    partsCost: 120,
    partsMarkup: 25,
    callbackReserve: 5,
    overheadRate: 10,
    targetMargin: 30,
  });
  assert.equal(result.target, 635.25);
  assert.match(html, /value="0.5"/);
  assert.match(html, /value="1.5"/);
  assert.match(html, /value="80"/);
  assert.match(html, /value="120"/);
  assert.match(html, /value="30"/);
});
