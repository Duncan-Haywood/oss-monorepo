import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");

test("page carries the no-warranty clause and a local-only privacy line", () => {
  assert.match(page, /no warranty/i);
  assert.match(page, /not legal, security, or compliance advice/i);
  assert.match(page, /Best-effort hosting, no SLA/);
  assert.match(page, /never uploaded/i);
});

test("page wires evidence, usage, and app scripts", () => {
  assert.match(page, /id="before-paste"/);
  assert.match(page, /id="after-paste"/);
  assert.match(page, /src="evidence\.js"/);
  assert.match(page, /src="usage\.js"/);
  assert.match(page, /src="app\.js"/);
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(app, /recordUsage/);
  assert.match(app, /snapshot_compared/);
  assert.match(app, /buildReport/);
});

test("page explicitly disclaims uploading snapshots anywhere", () => {
  assert.doesNotMatch(page, /upload (your|the) snapshot/i);
  assert.match(page, /never uploaded/i);
});

test("page states it never contacts a vendor itself", () => {
  assert.match(page, /never contacts a vendor/i);
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

test("example fixtures referenced by app.js are real snapshots checked into the venture", () => {
  const before = JSON.parse(readFileSync(new URL("./examples/before.json", import.meta.url), "utf8"));
  const after = JSON.parse(readFileSync(new URL("./examples/after.json", import.meta.url), "utf8"));
  assert.ok(before.url && before.captured_at && before.fetch_status && before.text);
  assert.ok(after.url && after.captured_at && after.fetch_status && after.text);
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(app, /examples\/before\.json/);
  assert.match(app, /examples\/after\.json/);
});
