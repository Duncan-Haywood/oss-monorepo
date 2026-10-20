import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { TOOLS, SITUATIONS, SAMPLE, match, categories, summaryText } from "./calc.mjs";

const here = (p) => new URL(`../${p}`, import.meta.url);

test("every catalogued tool is a real venture directory with a page", () => {
  for (const t of TOOLS) assert.ok(existsSync(here(`${t[1]}/index.html`)), t[1]);
});

test("every uk-* venture is in the catalogue (a new UK tool must be added here)", () => {
  const dirs = readdirSync(here("")).filter((d) => d.startsWith("uk-") && d !== "uk-money-tools-finder");
  const slugs = new Set(TOOLS.map((t) => t[1]));
  for (const d of dirs) assert.ok(slugs.has(d), `${d} is missing from TOOLS`);
  assert.equal(slugs.size, TOOLS.length, "duplicate slug");
});

test("every tag is a known situation and every situation reaches a tool", () => {
  const known = new Set(SITUATIONS.map((s) => s[0]));
  for (const t of TOOLS) for (const tag of t[4]) assert.ok(known.has(tag), tag);
  for (const k of known) assert.ok(TOOLS.some((t) => t[4].includes(k)), `${k} reaches no tool`);
});

test("match ranks tools by how many ticked situations they answer", () => {
  const r = match(["selfemployed", "company"]);
  assert.equal(r[0].slug, "uk-sole-trader-vs-limited-company-calculator");
  assert.equal(r[0].score, 2);
  assert.ok(r.every((x, i) => i === 0 || r[i - 1].score >= x.score));
});

test("nothing ticked, nothing returned; unknown values are ignored", () => {
  assert.deepEqual(match([]), []);
  assert.deepEqual(match(undefined), []);
  assert.deepEqual(match(["nope"]), []);
});

test("the Scottish situation finds the Scottish tool first", () => {
  assert.equal(match(["scotland"])[0].slug, "uk-scottish-income-tax-calculator");
});

test("the sample returns tools and the summary lists them", () => {
  const r = match(SAMPLE.picked);
  assert.ok(r.length >= 3);
  assert.match(summaryText(r), /1\. /);
  assert.match(summaryText([]), /No tools matched/);
});

test("categories cover every tool exactly once", () => {
  const n = categories().reduce((a, c) => a + c.tools.length, 0);
  assert.equal(n, TOOLS.length);
});
