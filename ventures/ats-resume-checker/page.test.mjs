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

// Reciprocal of the link in epk-generator's footer. Both tools are a
// self-presentation document sent to a gatekeeper to get chosen -- a resume
// to an ATS/recruiter, an electronic press kit to a venue/festival/blog --
// for a different kind of applicant.
test("index links one hop to the epk-generator sibling", () => {
  assert.match(
    html,
    /href="\.\.\/epk-generator\/"/,
    "index must link ../epk-generator/ so a musician looking for the ATS-equivalent check reaches it in one hop",
  );
});

// The two surfaces every user-facing page here carries. Asserted rather than
// assumed: CLAUDE.md's definition of done requires both, and a footer edit is
// exactly the kind of change that quietly drops one.
test("index keeps its liability disclaimer and its no-upload promise", () => {
  assert.match(html, /No warranty/i, "the liability disclaimer is missing");
  assert.match(html, /never uploaded/i, "the no-upload privacy line is missing");
});

// The keyword match is a second feature on the same page; a later edit that
// drops the posting box or the module import would leave the README promising
// something the page cannot do.
test("index wires up the job-posting keyword match", () => {
  assert.match(html, /id="posting-text"/);
  assert.match(html, /import \{ matchPosting, summarizeMatch \} from "\.\/match\.mjs"/);
  assert.match(html, /not an applicant tracking system'?s\s+score/i, "the page must say the percentage is not an ATS score");
  assert.match(html, /<code>match_run<\/code>/, "the new usage event must be disclosed in the footer");
});

test("index links one hop to the job-application-tracker sibling", () => {
  assert.match(html, /href="\.\.\/job-application-tracker\/"/);
});

test("the wording-changes box discloses the one request it can make and keeps the key out of storage", () => {
  assert.match(html, /import \{ tailor \} from "\.\/tailor\.mjs"/);
  assert.match(html, /sent from this browser to the provider you choose, and nowhere else/);
  assert.match(html, /<code>tailor_run<\/code>/, "the new usage event must be disclosed in the footer");
  assert.match(html, /id="key" type="password"/);
  const script = html.slice(html.indexOf('<script type="module">'));
  const keyUse = script.match(/[^\n]*#key[^\n]*/g) || [];
  for (const l of keyUse) assert.ok(!/localStorage|sessionStorage/.test(l), "the API key must not be stored");
});
