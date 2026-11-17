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

// Real wide data (data/uk-road-casualties.csv: Rdatasets Seatbelts, Harvey 1989, monthly 1969-1984, seven
// series). Over COLUMNS_PER_GROUP columns, the report splits the chart and the joint table into print-sized
// groups (eval/multi-report-print.mjs measures that each fits an A4 page; before, the joint table ran to
// 814 px against 680 printable and scrolled sideways, which a printer cannot do).
import { columnGroups, COLUMNS_PER_GROUP } from "./multi-report.mjs";

test("columnGroups: one group up to the limit, then balanced groups that cover every column once", () => {
  assert.deepEqual(columnGroups(3, "meanvar"), [[0, 3]]);
  assert.deepEqual(columnGroups(COLUMNS_PER_GROUP.mean, "mean"), [[0, 6]]);
  assert.deepEqual(columnGroups(7, "mean"), [[0, 4], [4, 7]]);
  assert.deepEqual(columnGroups(7, "meanvar"), [[0, 4], [4, 7]]);
  assert.deepEqual(columnGroups(20, "meanvar"), [[0, 4], [4, 8], [8, 12], [12, 16], [16, 20]]);
  for (const d of [1, 2, 5, 9, 13, 31]) for (const m of ["mean", "meanvar"]) {
    const g = columnGroups(d, m);
    assert.equal(g[0][0], 0); assert.equal(g.at(-1)[1], d);
    for (let k = 1; k < g.length; k++) assert.equal(g[k][0], g[k - 1][1]);
    assert.ok(g.every(([a, b]) => b - a >= 1 && b - a <= COLUMNS_PER_GROUP[m]));
  }
});

test("seven real columns: two charts and two joint tables, each column in exactly one, same changes on every chart", () => {
  const q = parseColumns(readFileSync(new URL("./data/uk-road-casualties.csv", import.meta.url), "utf8"));
  assert.equal(q.cols.length, 7); assert.equal(q.labels.length, 192);
  const rr = analyzeMulti({ ...q, model: "meanvar" });
  const h = multiReportHtml(q, rr);
  assert.equal((h.match(/<svg /g) || []).length, 2);
  assert.match(h, /<strong>Columns 1 to 4 of 7:<\/strong> DriversKilled, drivers, front, rear/);
  assert.match(h, /<strong>Columns 5 to 7 of 7:<\/strong> kms, PetrolPrice, VanKilled/);
  for (const [a, b] of [[0, 4], [4, 7]]) assert.ok(h.includes(multiChartSvg({ ...q, cols: q.cols.slice(a, b), names: q.names.slice(a, b) }, rr)));
  for (const c of q.names) assert.equal((h.match(new RegExp(`<th class="n">${c} shift`, "g")) || []).length, 1, c);
  assert.ok(!h.includes(multiChartSvg(q, rr)), "the one tall chart is gone");
  // What the data says: the joint level-and-volatility fit has a change at the seat-belt law (February 1983)...
  assert.ok(rr.joint.some((j) => j.label === "1983-02"), rr.joint.map((j) => j.label).join(" "));
  // ...but no column-by-column change is agreed there: only the petrol price's three steps are (no season term
  // in the several-column mode, and the monthly casualty counts are strongly seasonal).
  assert.deepEqual(rr.agreed.map((a) => `${a.label} ${a.columns.join(",")}`), ["1974-04 PetrolPrice", "1977-08 PetrolPrice", "1979-06 PetrolPrice"]);
});
