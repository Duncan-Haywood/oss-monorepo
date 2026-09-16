import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { nextRuns, summarizeRuns, utcOffsetDrift } from "./engine.mjs";

const DOCS_PAGE = "why-cron-jobs-break-across-dst.html";

test("index links to the docs page", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(
    page,
    new RegExp(`href="${DOCS_PAGE.replace(/\./g, "\\.")}"`),
    "index must link the secondary docs page so crawlers can reach it",
  );
});

test("docs page links back to the tool", async () => {
  const page = await readFile(new URL(`./${DOCS_PAGE}`, import.meta.url), "utf8");
  assert.match(page, /href="\.\/"/);
});

test("both pages carry the no-warranty clause", async () => {
  for (const file of ["index.html", DOCS_PAGE]) {
    const page = await readFile(new URL(`./${file}`, import.meta.url), "utf8");
    assert.match(page, /no warranty/i, `${file} is missing the no-warranty clause`);
  }
});

test("index carries the sponsor link", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("index states nothing is uploaded (privacy line)", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /never uploaded|never leaves your device|sent anywhere|Nothing is uploaded/i);
});

test("index links to at least one sibling drift-check venture", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(
    page,
    /href="\.\.\/agent-instructions-drift-check\/"/,
    'index must link ../agent-instructions-drift-check/ so crawlers reach a related tool in one hop',
  );
});

test("index has SoftwareApplication and FAQPage JSON-LD", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /"@type":"SoftwareApplication"/);
  assert.match(page, /"@type":"FAQPage"/);
});

test("index has a usage opt-out control", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /id="optout"/);
});

// The schedule worked example must actually demonstrate a real spring-forward
// skip when run through this venture's own engine (PRODUCT_PLAYBOOK.md §5e,
// "prove it on a worked example"), not just look plausible by eye.
test("index's schedule worked example demonstrates a real spring-forward skip (dogfooding)", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const cronMatch = /const EXAMPLE_CRON = "([^"]+)";/.exec(page);
  const tzMatch = /const EXAMPLE_TZ = "([^"]+)";/.exec(page);
  const fromMatch = /const EXAMPLE_FROM = "([^"]+)";/.exec(page);
  assert.ok(cronMatch && tzMatch && fromMatch, "expected EXAMPLE_CRON/EXAMPLE_TZ/EXAMPLE_FROM constants in index.html");

  const result = nextRuns(cronMatch[1], tzMatch[1], { from: new Date(fromMatch[1]), count: 5 });
  const { status } = summarizeRuns(result);
  assert.equal(status, "dst-risk", "the schedule worked example should demonstrate real DST risk");
  assert.ok(result.flagged.some((f) => f.kind === "skipped"), "expected a skipped occurrence in the worked example's window");
});

// The drift worked example (09:00 America/New_York, year 2027, set directly
// in the click handler rather than via a named constant) must also
// demonstrate real drift when run through the engine.
test("index's drift worked example demonstrates real fixed-UTC-cron drift (dogfooding)", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /\$\("#drift-time-input"\)\.value = "09:00"/);
  assert.match(page, /\$\("#drift-tz-input"\)\.value = "America\/New_York"/);
  assert.match(page, /yearInput\.value = 2027/);
  const drift = utcOffsetDrift(9, 0, "America/New_York", 2027);
  assert.equal(drift.observesDst, true);
  assert.ok(drift.driftMinutes > 0);
});
