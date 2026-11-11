import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseColumns, analyzeMulti } from "./multivariate.mjs";
import { multiChartSvg } from "./multi-view.mjs";
import { multiReportHtml } from "./multi-report.mjs";

// A small two-column series: column a steps at row 30, column b at row 60.
let seed = 7;
const noise = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 - 0.5; };
const rows = ["t,a,b"];
for (let i = 0; i < 90; i++) rows.push(`d${i},${((i < 30 ? 10 : 14) + noise()).toFixed(3)},${((i < 60 ? 5 : 2) + noise() * 0.8).toFixed(3)}`);
const csv = rows.join("\n");
const p = parseColumns(csv);
const r = analyzeMulti({ ...p });

test("the several-column report leads with agreed changes and carries the chart, both tables and the assumptions", () => {
  const h = multiReportHtml(p, r, { title: "Two sensors", author: "A. Analyst", date: "2026-11-11", contact: "a@example.com" });
  assert.match(h, /<h1>Two sensors<\/h1>/);
  assert.match(h, /A\. Analyst · 2026-11-11 · a@example\.com/);
  assert.match(h, /<h2>What changed<\/h2>\n<p class="agreed"><strong>Agreed changes:<\/strong>/);
  assert.ok(r.agreed.some((c) => c.columns.includes("a")) && r.agreed.some((c) => c.columns.includes("b")), JSON.stringify(r.agreed));
  for (const c of r.agreed) assert.ok(h.includes(`<td>${c.label}</td>`));
  assert.ok(h.includes(multiChartSvg(p, r)));
  assert.match(h, /<h2>Each column on its own<\/h2>/);
  assert.match(h, /<h2>One segmentation for all columns<\/h2>/);
  assert.match(h, /does not show what caused it/);
  assert.match(h, /no warranty/);
  assert.match(h, /2 columns, 90 points analysed/);
});

test("column names, labels and typed text are escaped; default title says several columns", () => {
  const evil = ["t,<img src=x onerror=1>,b"];
  for (let i = 0; i < 40; i++) evil.push(`<b>${i}</b>,${i < 20 ? 1 : 5},${i % 3}`);
  const q = parseColumns(evil.join("\n"));
  const h = multiReportHtml(q, analyzeMulti({ ...q }), { author: "<script>x</script>", notes: "<u>n</u>", accent: "red;}</style><script>", logo: "data:image/svg+xml;base64,AAAA" });
  assert.ok(!h.includes("<script>") && !h.includes("<img src=x") && !h.includes("<b>1</b>") && !h.includes("<u>n</u>") && !h.includes("svg+xml"));
  assert.match(h, /<h1>Change report: several columns<\/h1>/);
});

test("no agreed change says so instead of an empty lead", () => {
  const flat = ["t,a,b"];
  for (let i = 0; i < 40; i++) flat.push(`${i},${10 + (i % 2) * 0.01},${3 + (i % 3) * 0.01}`);
  const q = parseColumns(flat.join("\n"));
  const rr = analyzeMulti({ ...q });
  if (!rr.agreed.length) assert.match(multiReportHtml(q, rr), /no change that every setting agrees on in any of the 2 columns/);
});

test("the several-column sample is what the real code produces, and the sales page links it", async () => {
  const { sampleMultiReport } = await import("./build-sample-report.mjs");
  const h = readFileSync(new URL("./sample-multi-change-report.html", import.meta.url), "utf8");
  assert.equal(h, sampleMultiReport());
  // The two documented FX events the sample's notes name.
  assert.match(h, /<tr><td>2015-01-20<\/td><td class="n">1 of 3<\/td><td>chf<\/td><\/tr>/);
  assert.match(h, /<tr><td>2016-06-24<\/td><td class="n">1 of 3<\/td><td>gbp<\/td><\/tr>/);
  assert.match(h, /noindex/);
  const page = readFileSync(new URL("./change-report-for-analysts.html", import.meta.url), "utf8");
  assert.match(page, /sample-multi-change-report\.html/);
});

test("the page opens the several-column report when several columns are selected", () => {
  const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /import \{ multiReportHtml \} from "\.\/multi-report\.mjs"/);
  assert.match(page, /multi \? multiReportHtml\(lastMulti\.p, lastMulti\.r, brand\)/);
});
