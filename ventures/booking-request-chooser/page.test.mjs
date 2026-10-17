import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { parseCalendar, plan, summarize } from "./engine.mjs";

const DOCS = "which-booking-request-to-accept.html";
const read = (f) => readFile(new URL(`./${f}`, import.meta.url), "utf8");

test("index and docs link to each other", async () => {
  assert.ok((await read("index.html")).includes(`href="${DOCS}"`));
  assert.match(await read(DOCS), /href="\.\/"/);
});

test("both pages carry no-warranty, FAQ data; index carries sponsor, privacy and opt-out", async () => {
  for (const f of ["index.html", DOCS]) {
    const p = await read(f);
    assert.match(p, /no warranty/i, f);
    assert.match(p, /FAQPage/, f);
  }
  const idx = await read("index.html");
  assert.match(idx, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(idx, /never uploaded|never leaves your device/i);
  assert.match(idx, /id="optout"/);
});

test("every .html file is in the sitemap", async () => {
  const sitemap = await read("sitemap.xml");
  for (const name of readdirSync(new URL("./", import.meta.url)).filter((n) => n.endsWith(".html") && n !== "index.html")) {
    assert.ok(sitemap.includes(name), `${name} missing from sitemap.xml`);
  }
});

test("the page's worked example demonstrates the headline claim (dogfooding)", async () => {
  const page = await read("index.html");
  const m = /const EXAMPLE_SOURCE = `([\s\S]*?)`;/.exec(page);
  assert.ok(m, "expected EXAMPLE_SOURCE in index.html");
  assert.equal(m[1].trim(), (await read("fixtures/calendar.csv")).trim());
  const p = plan(parseCalendar(m[1]), { turnover: 60, nightValue: 50, minStay: 3 });
  assert.ok(p.totals.upliftVsFirstComeFirstServed > 0);
  assert.equal(summarize(p).status, "gain");
  // the example's inputs on the page are the ones the test uses
  assert.match(page, /id="turnover" value="60"/);
  assert.match(page, /id="night-value" value="50"/);
  assert.match(page, /id="min-stay" value="3"/);
});

test("the docs page's worked example matches the engine", async () => {
  const p = plan(
    parseCalendar("booked,2026-07-01,2026-07-05,1\nbooked,2026-07-12,2026-07-15,1\nrequest,2026-07-07,2026-07-10,480,A\nrequest,2026-07-05,2026-07-09,440,B\nrequest,2026-07-09,2026-07-12,345,C"),
    { turnover: 60, nightValue: 50, minStay: 3 },
  );
  assert.equal(p.totals.upliftVsFirstComeFirstServed, 245);
  assert.ok((await read(DOCS)).includes("$245"));
});

test("index links to the STR siblings", async () => {
  const idx = await read("index.html");
  assert.ok(idx.includes('href="../str-nightly-rate-optimizer/"'));
});
