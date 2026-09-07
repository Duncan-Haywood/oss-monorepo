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

test("the share link wires encode, terms, and restore, not just the button", () => {
  // A button with no wiring behind it is worse than no button: it tells a
  // tech the feature exists. This is the source-level half of what
  // `platform/proposal/term-ids.test.mjs` checks across every venture.
  assert.match(html, /import \{ encodeInputs, decodeInputs \} from '\.\/share\.mjs'/);
  assert.match(html, /withTerms\(/, "copyLink does not fold the proposal terms into the link");
  assert.match(html, /splitTerms\(/, "restoreShare does not separate the terms from the venture payload");
  assert.match(html, /applyTerms\(/, "a restored link does not write the terms back onto the panel");
  assert.match(html, /readTerms\(/, "copyLink does not read the terms currently on the panel");
  assert.match(html, /overlongTermsNote\(/, "a term dropped for length is not named back to the sender");
  assert.match(html, /restoreShare\(\)/, "restoreShare is defined but never called on load");
  assert.match(html, /id="copyLink"/, "the share-link button is missing");
  assert.match(html, /s\.setItem\(DRAFT_KEY/, "the quote draft is not kept on the visitor's own device between visits");
});

// Closest MEP sibling: same subcategory, but a recurring HVAC maintenance
// plan rather than a one-off appliance repair call. Related-tool chrome
// rotates inside the subcategory, so without an explicit one-hop a crawler
// on this page may never land on that tool.
test("index links one hop to the hvac-maintenance-contract-calculator sibling", () => {
  assert.match(
    html,
    /href="\.\.\/hvac-maintenance-contract-calculator\/"/,
    "index must link ../hvac-maintenance-contract-calculator/ so crawlers reach the HVAC plan calculator in one hop",
  );
  assert.match(html, /HVAC maintenance contract pricing calculator/i);
});
