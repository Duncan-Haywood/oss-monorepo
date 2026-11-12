// The call-out page's table, as eval/callout-cover-study.mjs computes it. Split out of page.test.mjs, one file per
// study, because node --test runs files in parallel and each study rebuilds the sample week about thirty times.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { study, SAMPLE } from "./eval/callout-cover-study.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("call-out page's table is what the engine returns for the sample cafe", () => {
  const a = study(SAMPLE());
  assert.deepEqual([a.cases, a.patched, a.covered, Math.min(...a.moves), Math.max(...a.moves)], [27, 0, 15, 2, 15]);
  const html = page("how-to-cover-a-shift-when-someone-calls-out.html");
  for (const t of ["27", "2 to 15", "15 of 27", "No warranty", "not legal, tax or financial advice"]) assert.ok(html.includes(t), t);
  assert.match(page("sitemap.xml"), /how-to-cover-a-shift-when-someone-calls-out\.html/);
  assert.match(page("index.html"), /how-to-cover-a-shift-when-someone-calls-out\.html/);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});
