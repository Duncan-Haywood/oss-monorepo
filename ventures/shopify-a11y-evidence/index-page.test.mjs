import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");

test("evidence page can copy the generated record without leaving the browser", () => {
  assert.match(page, /id="copy"/);
  assert.match(page, /Copy record/);
  assert.match(page, /navigator\.clipboard\.writeText\(reportAsText\(latest\)\)/);
  assert.match(page, /report_copied/);
  assert.match(page, /Copy is unavailable\. Use Download \.txt instead/);
});
