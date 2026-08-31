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

test("an invalid scan clears the stale report and refuses to let Download/Copy ship it", () => {
  // Before this fix, invalid JSON (or a document that isn't an axe-core
  // export) set #error but left the previous scan's report in #report and
  // its stats in #stats, and `latest` still pointed at that stale report --
  // so Download .txt / Copy record would ship a report for a scan that no
  // longer matches what is pasted into the textarea.
  const scriptMatch = page.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, "app script not found");
  const clickHandler = scriptMatch[1].match(/'#generate'\)\.addEventListener\('click', \(\) => \{ try \{([\s\S]*?)\n {4}\} \}\);/);
  assert.ok(clickHandler, "the #generate click handler was not found");
  const catchBlock = clickHandler[1].match(/\} catch \(error\) \{([\s\S]*)$/);
  assert.ok(catchBlock, "catch block not found inside the click handler");
  const body = catchBlock[1];
  assert.match(body, /latest = null/, "`latest` is not reset, so Download/Copy could still ship a stale report");
  assert.match(body, /reportEl\.textContent = ''/, "#report keeps its stale value instead of being cleared on a rejected input");
  assert.match(body, /querySelector\('#stats'\)\.textContent = ''/, "#stats keeps its stale value instead of being cleared on a rejected input");
  assert.match(body, /error\.message/, "the error message is never shown");
});
