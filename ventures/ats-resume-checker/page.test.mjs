// Page-level assertions for the checker's own landing page.
//
// Kept separate from `checker.test.mjs`, which exercises `analyze()` against
// resume text and never reads the markup.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

// Reciprocal of the link in freelance-retainer-calculator's footer. Both tools
// answer "how do I get paid" for one person working for themselves, and the
// reader who pastes a resume here is often the same one pricing client work.
test("index links one hop to the freelance-retainer-calculator sibling", () => {
  assert.match(
    html,
    /href="\.\.\/freelance-retainer-calculator\/"/,
    "index must link ../freelance-retainer-calculator/ so a reader weighing both reaches it in one hop",
  );
});

// The two surfaces every user-facing page here carries. Asserted rather than
// assumed: CLAUDE.md's definition of done requires both, and a footer edit is
// exactly the kind of change that quietly drops one.
test("index keeps its liability disclaimer and its no-upload promise", () => {
  assert.match(html, /No warranty/i, "the liability disclaimer is missing");
  assert.match(html, /never uploaded/i, "the no-upload privacy line is missing");
});
