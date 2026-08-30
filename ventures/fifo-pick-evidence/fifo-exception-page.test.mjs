import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { checkRows } from "./evidence.js";

const docsPage = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const html = docsPage("what-counts-as-a-fifo-exception.html");
const index = docsPage("index.html");

test("index links to the FIFO-exception SEO/AI-discovery page", () => {
  assert.match(index, /what-counts-as-a-fifo-exception\.html/);
});

test("the docs page answers the search question with the disclaimers intact", () => {
  assert.match(html, /What Counts as a FIFO Exception/i);
  assert.match(html, /FAQPage/);
  assert.match(html, /"@type":"Question"/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /never uploaded/i);
});

test("the worked table matches checkRows output, not hand-typed figures", () => {
  const rows = [
    { order_id: "OLD-1", sku: "A", lot: "1", received_at: "2026-01-01T00:00:00Z", picked_at: "2026-01-03T00:00:00Z" },
    { order_id: "NEW-1", sku: "A", lot: "2", received_at: "2026-01-02T00:00:00Z", picked_at: "2026-01-02T12:00:00Z" },
  ];
  const observations = checkRows(rows);

  const flagged = observations.filter((obs) => obs.kind === "fifo-exception");
  assert.equal(flagged.length, 1, "expected exactly one row flagged");
  assert.equal(flagged[0].order_id, "NEW-1");
  assert.equal(flagged[0].older_order_id, "OLD-1");
  assert.equal(flagged[0].row, 3, "NEW-1 is the second data row, csv row 3");
  assert.equal(flagged[0].older_row, 2, "OLD-1 is the first data row, csv row 2");

  assert.match(html, /OLD-1/);
  assert.match(html, /NEW-1/);
  assert.match(html, /fifo-exception/);
});

test("a SKU with only one row never produces a fifo-exception, matching the page's claim", () => {
  const rows = [
    { order_id: "SOLO", sku: "B", lot: "1", received_at: "2026-01-01T00:00:00Z", picked_at: "2026-01-05T00:00:00Z" },
  ];
  assert.deepEqual(checkRows(rows), []);
});

test("different SKUs picked out of order never produce a fifo-exception", () => {
  const rows = [
    { order_id: "A-1", sku: "A", lot: "1", received_at: "2026-01-01T00:00:00Z", picked_at: "2026-01-05T00:00:00Z" },
    { order_id: "B-1", sku: "B", lot: "1", received_at: "2026-01-04T00:00:00Z", picked_at: "2026-01-02T00:00:00Z" },
  ];
  assert.deepEqual(checkRows(rows).filter((obs) => obs.kind === "fifo-exception"), []);
});

test("sitemap lists the new page", () => {
  const sitemap = docsPage("sitemap.xml");
  assert.match(sitemap, /fifo-pick-evidence\/<\/loc>/);
  assert.match(sitemap, /what-counts-as-a-fifo-exception\.html/);
});
