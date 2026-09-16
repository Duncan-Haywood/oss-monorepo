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

// The comparison page is this venture's organic-discovery surface for
// searchers who have just done the obvious manual thing (checked a DST
// calendar) and either got the wrong answer or wondered what else they
// might be missing. A crawler that never reaches it is a channel that does
// not exist, so this is the same one-hop assertion the other pages carry.
const VS_PAGE = "vs-checking-a-dst-calendar-by-hand.html";

test("index links to the comparison page", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, new RegExp(`href="${VS_PAGE.replace(/\./g, "\\.")}"`));
});

test("the comparison page links back to the checker and its FAQPage JSON-LD matches the visible text", async () => {
  const vs = await readFile(new URL(`./${VS_PAGE}`, import.meta.url), "utf8");
  assert.match(vs, /href="\.\/"/);
  const blocks = [...vs.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
    JSON.parse(m[1]),
  );
  const faq = blocks.find((b) => b["@type"] === "FAQPage");
  assert.ok(faq, "missing FAQPage JSON-LD on the comparison page");
  assert.ok(faq.mainEntity.length >= 3);
  const visible = vs.replace(/&mdash;/g, "—").replace(/&amp;/g, "&");
  for (const { name, acceptedAnswer } of faq.mainEntity) {
    assert.ok(visible.includes(name), `question not found verbatim: ${name}`);
    assert.ok(visible.includes(acceptedAnswer.text), `answer not found verbatim for: ${name}`);
  }
});

test("the comparison page carries the disclaimers and is listed in the venture sitemap", async () => {
  const vs = await readFile(new URL(`./${VS_PAGE}`, import.meta.url), "utf8");
  assert.match(vs, /No warranty/);
  assert.match(vs, /Nothing leaves your browser/);
  assert.match(vs, /names no specific product/i);
  const sitemap = await readFile(new URL("./sitemap.xml", import.meta.url), "utf8");
  assert.match(sitemap, new RegExp(VS_PAGE.replace(/\./g, "\\.")));
});

test("the comparison page does not repeat a question the index page already answers", async () => {
  const faqOf = async (name) => {
    const html = await readFile(new URL(`./${name}`, import.meta.url), "utf8");
    const block = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1]))
      .find((b) => b["@type"] === "FAQPage");
    return new Set(block.mainEntity.map((q) => q.name));
  };
  const vsQuestions = await faqOf(VS_PAGE);
  const indexQuestions = await faqOf("index.html");
  const overlap = [...vsQuestions].filter((q) => indexQuestions.has(q));
  assert.deepEqual(overlap, [], `duplicated FAQ question(s): ${overlap.join(", ")}`);
});

// The comparison table claims the checker catches the cron OR-rule
// misreading that eyeballing a schedule against a calendar would not. Prove
// it against the real engine: a schedule restricted on both day-of-month and
// day-of-week fires on whichever matches, which can land on a transition
// date a naive by-hand reading (checking only the named day-of-month) would
// have ruled out.
test("the comparison page's OR-rule claim holds against the real engine", async () => {
  // 2027-03-14 is a Sunday and the America/New_York spring-forward date (the
  // same transition the index page's own worked example uses). A schedule
  // for "the 1st of the month OR any Sunday" at 02:30 must therefore flag
  // that date as a skip, even though the 1st alone would not have matched.
  const result = nextRuns("30 2 1 * 0", "America/New_York", {
    from: new Date("2027-03-10T00:00:00Z"),
    count: 3,
  });
  const { status } = summarizeRuns(result);
  assert.equal(status, "dst-risk");
  assert.ok(
    result.flagged.some((f) => f.kind === "skipped" && f.local.year === 2027 && f.local.month === 3 && f.local.day === 14),
    "expected the OR-matched Sunday 2027-03-14 to be flagged as a spring-forward skip",
  );
});
