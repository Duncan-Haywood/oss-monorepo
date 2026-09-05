import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");

test("page carries the no-warranty clause and a local-only privacy line", () => {
  assert.match(page, /no warranty/i);
  assert.match(page, /not legal, tax, financial, medical, or engineering advice/i);
  assert.match(page, /Best-effort hosting, no SLA/);
  assert.match(page, /never uploaded/i);
});

test("page wires evidence, usage, and app scripts", () => {
  assert.match(page, /id="lockfile-input"/);
  assert.match(page, /src="evidence\.js"/);
  assert.match(page, /src="usage\.js"/);
  assert.match(page, /src="app\.js"/);
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(app, /recordUsage/);
  assert.match(app, /report_generated/);
  assert.match(app, /buildReport/);
});

test("page explicitly disclaims uploading the lockfile anywhere", () => {
  assert.doesNotMatch(page, /upload (your|the) lockfile/i);
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

test("example fixture referenced by app.js is a real lockfile checked into the venture", () => {
  const example = readFileSync(new URL("./example-package-lock.json", import.meta.url), "utf8");
  const parsed = JSON.parse(example);
  assert.ok(parsed.lockfileVersion === 2 || parsed.lockfileVersion === 3);
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(app, /example-package-lock\.json/);
});

// Regression: sitemap.xml carried only the index page -- vs-npm-audit.html
// and which-npm-vulnerabilities-actually-reach-production.html, both real
// pages linked from index.html, were never in it, so a crawler following
// robots.txt -> sitemap.xml never discovered them. Same defect class fixed
// for public-record-watch in #3289.
test("every .html file in the venture is reachable from the sitemap", () => {
  const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");
  const dir = new URL("./", import.meta.url);
  const htmlFiles = readdirSync(dir).filter((name) => name.endsWith(".html"));
  for (const name of htmlFiles) {
    if (name === "index.html") continue;
    assert.match(sitemap, new RegExp(name.replace(/\./g, "\\.")), `${name} is missing from sitemap.xml`);
  }
});
