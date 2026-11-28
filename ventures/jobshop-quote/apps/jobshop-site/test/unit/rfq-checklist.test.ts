// The /rfq-review-checklist guide: every check is on the page and in the CSV, the CSV has no formula
// cells, the page is built, linked and indexed, and it never claims the list meets a standard.
import { buildSite, fileFor } from "@site/build";
import type { Launch } from "@site/config";
import { RFQ_CHECKS, RFQ_CSV_COLUMNS, RFQ_CSV_FILE, rfqChecklistCsv } from "@site/rfq-checklist";
import { describe, expect, it } from "vitest";

const SITE = "https://example.test/jobshop";
const OPEN: Launch = {
  appUrl: "https://app.example.test",
  open: true,
  aiReading: false,
  inboundEmail: false,
  paidPlans: false,
};

const escaped = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

describe("rfqChecklistCsv", () => {
  const rows = rfqChecklistCsv().trimEnd().split("\r\n");
  it("has the RFQ line, the header and one row per check", () => {
    expect(rows[0]).toBe("RFQ / customer,,Reviewed by,,Date,");
    expect(rows[1]).toBe(RFQ_CSV_COLUMNS.join(","));
    expect(rows).toHaveLength(2 + RFQ_CHECKS.length);
  });
  it("never writes a cell a spreadsheet would run as a formula", () => {
    for (const r of rows) expect(r).not.toMatch(/(^|,)"?[=+\-@]/);
  });
});

describe("/rfq-review-checklist", () => {
  const files = buildSite({ siteUrl: SITE, basePath: "/jobshop", launch: OPEN });
  const page = files.get(fileFor("/rfq-review-checklist")) ?? "";
  it("is built with its download, in the sitemap and llms.txt, and linked from the template and footer", () => {
    expect(page).toContain("<h1>RFQ review checklist for machine shops</h1>");
    expect(files.get(RFQ_CSV_FILE)).toBe(rfqChecklistCsv());
    expect(page).toContain(`href="/jobshop/${RFQ_CSV_FILE}"`);
    expect(files.get("sitemap.xml")).toContain(`${SITE}/rfq-review-checklist`);
    expect(files.get("llms.txt")).toContain(`${SITE}/rfq-review-checklist`);
    for (const from of ["/machine-shop-quote-template", "/", "/how-to-quote-welding"])
      expect(files.get(fileFor(from))).toContain('href="/jobshop/rfq-review-checklist"');
  });
  it("prints every check and what the app does for it", () => {
    for (const c of RFQ_CHECKS) {
      expect(page).toContain(escaped(c.check));
      if (c.inApp) expect(page).toContain(escaped(c.inApp));
    }
  });
  it("names clause 8.2.3 without claiming conformity, is not advice, and follows the AI switch", () => {
    expect(page).toContain("clause 8.2.3");
    expect(page).toContain("does not\n    by itself meet either standard");
    expect(page).toContain("not legal,");
    expect(page).toContain("AI reading is not switched on yet");
    expect(page).toContain('href="https://app.example.test/sign-up"');
    const on = buildSite({
      siteUrl: SITE,
      basePath: "/jobshop",
      launch: { ...OPEN, aiReading: true },
    });
    expect(on.get(fileFor("/rfq-review-checklist"))).not.toContain(
      "AI reading is not switched on yet",
    );
  });
});
