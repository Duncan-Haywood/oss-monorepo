// Quality round 116: snapshot fields are user-supplied and reach innerHTML.
const test = require("node:test");
const assert = require("node:assert/strict");
const { renderReport, escapeHtml } = require("./app.js");
const { buildReport } = require("./evidence.js");

test("escapeHtml neutralises markup", () => {
  assert.equal(escapeHtml(`<img src=x onerror="a('b')">&`), "&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;");
});

test("renderReport does not put a snapshot's raw markup into the page", () => {
  const evil = "<img src=x onerror=alert(1)>";
  const snap = (t, text) => JSON.stringify({ url: evil, captured_at: t, fetch_status: evil, text });
  const report = buildReport(snap("2026-08-23T09:00:00Z", "a"), snap("2026-08-24T09:00:00Z", "b"));
  const container = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [] };
  try { renderReport(container, report); } catch { /* DOM wiring after innerHTML needs a browser */ }
  assert.ok(container.innerHTML.length > 0, "renderReport wrote nothing");
  assert.ok(!container.innerHTML.includes("<img"), "raw <img> tag reached innerHTML");
  assert.ok(container.innerHTML.includes("&lt;img src=x onerror=alert(1)&gt;"));
});
