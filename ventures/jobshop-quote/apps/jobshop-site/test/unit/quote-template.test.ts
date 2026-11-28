// The /machine-shop-quote-template guide: the example quote reuses the CNC guide's engine-checked
// prices, the CSV is plain values with no formula cells, and the page is built, linked and indexed.
import { buildSite, fileFor } from "@site/build";
import type { Launch } from "@site/config";
import { EXAMPLE, priceExample, usdCents } from "@site/quote-example";
import { CSV_COLUMNS, CSV_FILE, csvCell, exampleQuote, templateCsv } from "@site/quote-template";
import { describe, expect, it } from "vitest";

const SITE = "https://example.test/jobshop";
const OPEN: Launch = {
  appUrl: "https://app.example.test",
  open: true,
  aiReading: false,
  inboundEmail: false,
  paidPlans: false,
};

describe("exampleQuote", () => {
  it("quotes the CNC guide's bracket at that guide's prices", () => {
    const breaks = exampleQuote().lines[0]?.breaks ?? [];
    expect(breaks).toEqual(
      priceExample(EXAMPLE).breaks.map((b) => ({
        quantity: b.quantity,
        unitPriceCents: b.unitPriceCents,
        totalCents: b.totalCents,
      })),
    );
    expect(breaks.map((b) => b.unitPriceCents)).toEqual([58_726, 11_353, 7_165]);
  });
});

describe("templateCsv", () => {
  const csv = templateCsv();
  const rows = csv.trimEnd().split("\r\n");
  it("has the header, one marked example row per break and blank lines", () => {
    expect(rows[0]).toBe(CSV_COLUMNS.join(","));
    expect(rows.filter((r) => r.includes("EXAMPLE (made up"))).toHaveLength(3);
    expect(rows).toHaveLength(1 + 3 + 10);
    expect(rows[1]).toContain(",1,587.26,587.26,");
    expect(rows[3]).toContain(",100,71.65,7165.00,");
    expect(rows.at(-1)).toBe(`11${",".repeat(CSV_COLUMNS.length - 1)}`);
  });
  it("never writes a cell a spreadsheet would run as a formula", () => {
    for (const r of rows) expect(r).not.toMatch(/(^|,)[=+\-@]/);
    expect(() => csvCell("=1+1")).toThrow();
    expect(() => csvCell("@SUM(A1)")).toThrow();
    expect(csvCell('a, "b"')).toBe('"a, ""b"""');
  });
});

describe("/machine-shop-quote-template", () => {
  const files = buildSite({ siteUrl: SITE, basePath: "/jobshop", launch: OPEN });
  const page = files.get(fileFor("/machine-shop-quote-template")) ?? "";
  it("is built with its download, in the sitemap and llms.txt, and linked from both guides and the footer", () => {
    expect(page).toContain("<h1>Machine shop quote template</h1>");
    expect(files.get(CSV_FILE)).toBe(templateCsv());
    expect(page).toContain(`href="/jobshop/${CSV_FILE}"`);
    expect(files.get("sitemap.xml")).toContain(`${SITE}/machine-shop-quote-template`);
    expect(files.get("llms.txt")).toContain(`${SITE}/machine-shop-quote-template`);
    for (const from of ["/how-to-quote-cnc-machining", "/how-to-quote-sheet-metal", "/"])
      expect(files.get(fileFor(from))).toContain('href="/jobshop/machine-shop-quote-template"');
  });
  it("prints the example's prices, says they are made up and is not legal advice", () => {
    for (const b of priceExample(EXAMPLE).breaks) {
      expect(page).toContain(usdCents(b.unitPriceCents));
      expect(page).toContain(usdCents(b.totalCents));
    }
    expect(page).toContain("are made up");
    expect(page).toContain("not legal, tax or");
    expect(page).toContain('href="https://app.example.test/sign-up?from=jobshop-site%2F');
  });
});
