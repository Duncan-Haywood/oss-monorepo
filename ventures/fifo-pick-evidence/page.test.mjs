import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");

test("page carries the no-warranty clause and a local-only privacy line", () => {
  assert.match(page, /no warranty/i);
  assert.match(page, /not engineering, legal, tax, financial, or compliance advice/i);
  assert.match(page, /Best-effort hosting, no SLA/);
  assert.match(page, /never uploaded/i);
});

test("page wires evidence, usage, and app scripts", () => {
  assert.match(page, /id="csv-input"/);
  assert.match(page, /src="evidence\.js"/);
  assert.match(page, /src="usage\.js"/);
  assert.match(page, /src="app\.js"/);
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(app, /recordUsage/);
  assert.match(app, /report_generated/);
  assert.match(app, /buildReport/);
});

test("page explicitly disclaims uploading the pick log anywhere", () => {
  assert.doesNotMatch(page, /upload (your|the) (pick log|csv)/i);
  assert.match(page, /never uploaded/i);
});

test("offers a worked example so a first visit does not start on an empty box", () => {
  assert.match(page, /id="load-example"/);
  assert.match(page, /worked example/i);
});

test("privacy opt-out checkbox is present and wired for usage counting", () => {
  assert.match(page, /id="optout"/);
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(app, /setUsageEnabled/);
  assert.match(app, /isUsageEnabled/);
});

test("example fixture referenced by app.js is a real pick log checked into the venture", () => {
  const example = readFileSync(new URL("./examples/picks.csv", import.meta.url), "utf8");
  assert.match(example, /order_id,sku,lot,received_at,picked_at/);
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(app, /examples\/picks\.csv/);
});

test("page has a Common questions FAQ section for AI/search discovery", () => {
  assert.match(page, /Common questions/);
  const questions = [...page.matchAll(/<h3>([^<]+\?)<\/h3>/g)];
  assert.ok(questions.length >= 2, "expected at least two FAQ questions");
});
