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

test("page names the WCAG 2.1 AA standard and links to the deadline lookup", () => {
  assert.match(page, /WCAG 2\.1 AA/);
  assert.match(page, /href="\.\/deadline\.html"/);
});

test("page carries the no-warranty clause and a working sponsor link", () => {
  assert.match(page, /no warranty/i);
  assert.match(page, /github\.com\/sponsors\/Duncan-Haywood/);
});
