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

test("repair vs replace section is on the quote page", () => {
  assert.match(html, /id="repair-vs-replace"/);
  assert.match(html, /compareServiceCallVsReplace/);
  assert.match(html, /should-i-repair-or-replace-this-appliance\.html/);
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

test("an invalid input clears every stale field in both result panels, not just the two headlines", () => {
  // Before this fix, update()'s catch block only overwrote #target and
  // #replaceVerdict with the error sentence. floor, cost, hours, rate,
  // parts, callback, the price-sensitivity #scenarios rows, and the
  // #replaceRows comparison table all kept showing the last valid
  // calculation. A visitor who missed the error message could easily read
  // those stale figures as the answer for the invalid inputs now in the
  // form.
  const catchMatch = html.match(/\} catch \(error\) \{([\s\S]*?)\n {6}\}\n {4}\}/);
  assert.ok(catchMatch, "update() catch block not found");
  const body = catchMatch[1];
  // `el(` rather than the page's original `$(`: the helper was renamed when
  // this venture adopted the shared customer proposal, whose generated wiring
  // calls `el()`. Two names for `getElementById` on one page is how the two
  // halves drift.
  assert.match(body, /el\('target'\)\.textContent = error\.message/, "the error message is never shown in #target");
  assert.match(body, /el\('replaceVerdict'\)\.textContent = error\.message/, "the error message is never shown in #replaceVerdict");
  for (const id of ["floor", "cost", "hours", "rate", "parts", "callback"]) {
    assert.match(
      body,
      new RegExp(`el\\('${id}'\\)\\.textContent = ''`),
      `#${id} keeps its stale value instead of being cleared on a rejected input`,
    );
  }
  assert.match(body, /el\('scenarios'\)\.replaceChildren\(\)/, "the stale price-sensitivity rows are not cleared");
  assert.match(body, /el\('replaceRows'\)\.replaceChildren\(\)/, "the stale repair-vs-replace rows are not cleared");
});

test("the result panel is announced to screen readers when it updates", () => {
  // The result section re-renders the target price, the dl breakdown, and
  // the price-sensitivity table in place on every keystroke, with no page
  // reload. Before this fix the only aria-live element on the page was
  // #status (a copy-quote message the render code never writes the result
  // figures into), so a screen-reader user changing an input got no
  // announcement that the readout had changed.
  assert.match(
    html,
    /<section class="result" aria-live="polite">/,
    "the result section is not a live region, so updates are never announced",
  );
});
