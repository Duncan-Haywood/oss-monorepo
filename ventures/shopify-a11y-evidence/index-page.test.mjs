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

test("invalid axe JSON clears the stale report and disarms Download/Copy instead of leaving them next to a silent error", () => {
  // Before this fix, the Generate click handler's catch block set #error but
  // left `latest` set to the previous successful buildReport() result, and
  // left #report and #stats showing that previous evidence record. A
  // visitor who missed the one-line error could read the stale report as
  // the evidence for the JSON just pasted in -- and Download/Copy would
  // still export that stale record, since both bail out only on `!latest`.
  const catchMatch = page.match(/\} catch \(error\) \{([\s\S]*?)\n\s*\} \}\);/);
  assert.ok(catchMatch, "the Generate click handler's catch block was not found");
  const body = catchMatch[1];
  assert.match(body, /latest = null/, "latest is not invalidated, so Download/Copy could still export a stale report");
  assert.match(body, /reportEl\.textContent = /, "#report keeps its stale evidence record instead of being reset");
  assert.match(body, /document\.querySelector\('#stats'\)\.textContent = /, "#stats keeps its stale counts instead of being reset");
  assert.match(body, /document\.querySelector\('#error'\)\.textContent = error\.message/, "the error message is never shown");
});
