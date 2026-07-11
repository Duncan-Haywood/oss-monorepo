import { describe, expect, it } from "vitest";
import { CSV_LEAD_TEMPLATE, parseCsvLine, parseLeadsCsv, slugifyBusinessName } from "./csv-import";

describe("parseCsvLine", () => {
  it("splits plain comma-separated fields", () => {
    expect(parseCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("honors double-quoted fields containing commas", () => {
    expect(parseCsvLine('a,"b, still b",c')).toEqual(["a", "b, still b", "c"]);
  });

  it("unescapes doubled quotes inside a quoted field", () => {
    expect(parseCsvLine('"she said ""hi""",b')).toEqual(['she said "hi"', "b"]);
  });
});

describe("slugifyBusinessName", () => {
  it("lowercases, hyphenates, and strips punctuation", () => {
    expect(slugifyBusinessName("Blue River Salon & Spa!")).toBe("blue-river-salon-spa");
  });

  it("falls back to 'lead' for names with no alphanumerics", () => {
    expect(slugifyBusinessName("***")).toBe("lead");
  });
});

describe("parseLeadsCsv", () => {
  it("parses the shipped template into one valid lead", () => {
    const result = parseLeadsCsv(CSV_LEAD_TEMPLATE);
    expect(result.errors).toEqual([]);
    expect(result.skipped).toBe(0);
    expect(result.leads).toHaveLength(1);
    expect(result.leads[0]).toMatchObject({
      slug: "blue-river-salon",
      businessName: "Blue River Salon",
      category: "salon",
      recommendedTier: "complete",
      dataSource: "csv_import",
    });
  });

  it("rejects CSV missing the required businessName header", () => {
    const result = parseLeadsCsv("category,city\nsalon,Denver");
    expect(result.leads).toEqual([]);
    expect(result.errors[0]?.message).toMatch(/Missing required header/);
  });

  it("rejects empty CSV text", () => {
    const result = parseLeadsCsv("");
    expect(result.leads).toEqual([]);
    expect(result.errors[0]?.message).toBe("CSV is empty");
  });

  it("skips rows missing businessName and reports the row number", () => {
    const csv = "businessName,category\n,salon\nAcme Trades,trades";
    const result = parseLeadsCsv(csv);
    expect(result.skipped).toBe(1);
    expect(result.errors).toEqual([{ row: 1, message: "businessName is required" }]);
    expect(result.leads).toHaveLength(1);
    expect(result.leads[0]?.businessName).toBe("Acme Trades");
  });

  it("rejects an invalid category", () => {
    const csv = "businessName,category\nAcme,not-a-category";
    const result = parseLeadsCsv(csv);
    expect(result.leads).toEqual([]);
    expect(result.errors[0]?.message).toMatch(/Invalid category/);
  });

  it("de-duplicates slugs across rows by appending a numeric suffix", () => {
    const csv = [
      "businessName,slug",
      "Acme One,acme",
      "Acme Two,acme",
      "Acme Three,acme",
    ].join("\n");
    const result = parseLeadsCsv(csv);
    expect(result.leads.map((l) => l.slug)).toEqual(["acme", "acme-2", "acme-3"]);
  });

  it("splits services on semicolons within a cell", () => {
    const csv = 'businessName,services\nAcme,"Haircuts; Color; Blowouts"';
    const result = parseLeadsCsv(csv);
    expect(result.leads[0]?.services).toEqual(["Haircuts", "Color", "Blowouts"]);
  });

  it("tags the configured dataSource and defaultStage on every parsed lead", () => {
    const csv = "businessName\nAcme";
    const result = parseLeadsCsv(csv, { dataSource: "manual_entry", defaultStage: "site_built" });
    expect(result.leads[0]?.dataSource).toBe("manual_entry");
    expect(result.leads[0]?.stage).toBe("site_built");
  });

  it("rejects more than the max row count", () => {
    const rows = Array.from({ length: 101 }, (_, i) => `Acme ${i}`).join("\n");
    const result = parseLeadsCsv(`businessName\n${rows}`);
    expect(result.leads).toEqual([]);
    expect(result.errors[0]?.message).toMatch(/Too many rows/);
  });
});
