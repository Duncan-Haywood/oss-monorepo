import { describe, expect, it } from "vitest";
import { MAX_LEAD_DATA_SOURCE_LENGTH } from "./create-fields";
import {
  CSV_LEAD_TEMPLATE,
  existingLeadSlugConflictMessage,
  MAX_CSV_IMPORT_TEXT_LENGTH,
  parseCsvImportText,
  parseCsvLine,
  parseLeadsCsv,
  partitionLeadsByExistingSlugs,
  slugifyBusinessName,
  splitCsvIntoLines,
} from "./csv-import";

describe("splitCsvIntoLines", () => {
  it("splits ordinary lines on newlines", () => {
    expect(splitCsvIntoLines("a,b\nc,d\ne,f")).toEqual(["a,b", "c,d", "e,f"]);
  });

  it("handles CRLF line endings", () => {
    expect(splitCsvIntoLines("a,b\r\nc,d")).toEqual(["a,b", "c,d"]);
  });

  it("does not split within a double-quoted field containing an embedded newline", () => {
    const csv = '"multi\nline",value\nnormal,row';
    expect(splitCsvIntoLines(csv)).toEqual(['"multi\nline",value', "normal,row"]);
  });

  it("handles trailing newline without emitting an empty trailing line", () => {
    expect(splitCsvIntoLines("a\nb\n")).toEqual(["a", "b"]);
  });

  it("returns empty array for empty text", () => {
    expect(splitCsvIntoLines("")).toEqual([]);
  });
});

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

  it("caps at 63 chars (DNS label max) so CSV-derived slugs stay Host-safe", () => {
    const longName = `Acme ${"Super ".repeat(20)}Plumbing LLC`;
    const slug = slugifyBusinessName(longName);
    expect(slug.length).toBeLessThanOrEqual(63);
    expect(slug).not.toMatch(/^-|-$/);
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
      hours: { weekday: "Mon–Fri 9am–5pm", weekend: "Sat 10am–2pm" },
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

  it("strips leading/trailing dashes from explicit slug columns", () => {
    // Regression: prior CSV sanitize kept edge dashes (demo-cafe-) while
    // leadSlugAsDnsLabel stripped them — preview subdomain Host lookup missed.
    const csv = [
      "businessName,slug",
      "Demo Cafe,-demo-cafe-",
      "Symbols Only,!!!",
    ].join("\n");
    const result = parseLeadsCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.leads.map((l) => l.slug)).toEqual(["demo-cafe", "symbols-only"]);
  });

  it("caps explicit slug columns and collision suffixes at 63 (DNS label max)", () => {
    const long = `long-slug-${"y".repeat(80)}`;
    const csv = [
      "businessName,slug",
      `Biz One,${long}`,
      `Biz Two,${long}`,
    ].join("\n");
    const result = parseLeadsCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.leads).toHaveLength(2);
    for (const lead of result.leads) {
      expect(lead.slug.length).toBeLessThanOrEqual(63);
      expect(lead.slug).not.toMatch(/^-|-$/);
    }
    expect(result.leads[0]?.slug).not.toBe(result.leads[1]?.slug);
  });

  it("splits services on semicolons within a cell", () => {
    const csv = 'businessName,services\nAcme,"Haircuts; Color; Blowouts"';
    const result = parseLeadsCsv(csv);
    expect(result.leads[0]?.services).toEqual(["Haircuts", "Color", "Blowouts"]);
  });

  it("parses an optional address column, leaving it undefined when absent", () => {
    const withAddress = parseLeadsCsv("businessName,address\nAcme,1200 Blake St");
    expect(withAddress.leads[0]?.address).toBe("1200 Blake St");

    const withoutAddress = parseLeadsCsv("businessName\nAcme");
    expect(withoutAddress.leads[0]?.address).toBeUndefined();
  });

  it("tags the configured dataSource and defaultStage on every parsed lead", () => {
    const csv = "businessName\nAcme";
    const result = parseLeadsCsv(csv, { dataSource: "manual_entry", defaultStage: "site_built" });
    expect(result.leads[0]?.dataSource).toBe("manual_entry");
    expect(result.leads[0]?.stage).toBe("site_built");
  });

  it("soft-caps an over-long dataSource tag before tagging leads", () => {
    const long = "batch-".repeat(20);
    const result = parseLeadsCsv("businessName\nAcme", { dataSource: long });
    expect(result.leads[0]?.dataSource).toHaveLength(MAX_LEAD_DATA_SOURCE_LENGTH);
    expect(result.leads[0]?.dataSource).toBe(
      long.slice(0, MAX_LEAD_DATA_SOURCE_LENGTH),
    );
  });

  it("rejects more than the max row count", () => {
    const rows = Array.from({ length: 101 }, (_, i) => `Acme ${i}`).join("\n");
    const result = parseLeadsCsv(`businessName\n${rows}`);
    expect(result.leads).toEqual([]);
    expect(result.errors[0]?.message).toMatch(/Too many rows/);
  });

  it("parses an optional hours column into a LeadHours object", () => {
    const csv = "businessName,hours\nAcme,Mon–Fri 9am–5pm · Sat–Sun Closed";
    const result = parseLeadsCsv(csv);
    expect(result.leads[0]?.hours).toEqual({
      weekday: "Mon–Fri 9am–5pm",
      weekend: "Sat–Sun Closed",
    });
  });

  it("uses default hours when the hours column is absent", () => {
    const result = parseLeadsCsv("businessName\nAcme");
    expect(result.leads[0]?.hours).toEqual({
      weekday: "Mon–Fri 9am–5pm",
      weekend: "Sat–Sun Closed",
    });
  });

  it("handles multi-line quoted fields (RFC 4180 embedded newlines)", () => {
    const csv = [
      "businessName,description",
      '"Acme Cafe","Multi-line',
      'description here"',
      "Other Shop,Single line",
    ].join("\n");
    const result = parseLeadsCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.leads).toHaveLength(2);
    expect(result.leads[0]?.businessName).toBe("Acme Cafe");
    expect(result.leads[0]?.description).toBe("Multi-line\ndescription here");
    expect(result.leads[1]?.businessName).toBe("Other Shop");
  });

  it("rejects an over-long businessName", () => {
    const csv = `businessName\n${"A".repeat(201)}`;
    const result = parseLeadsCsv(csv);
    expect(result.errors[0]?.message).toMatch(/businessName too long/);
    expect(result.leads).toEqual([]);
  });

  it("caps services array at MAX_SERVICES entries", () => {
    const manyServices = Array.from({ length: 150 }, (_, i) => `Service ${i}`).join(";");
    const csv = `businessName,services\nAcme,${manyServices}`;
    const result = parseLeadsCsv(csv);
    expect(result.leads[0]?.services).toHaveLength(100);
  });

  it("truncates an over-long description", () => {
    const longDesc = "X".repeat(2500);
    const csv = `businessName,description\nAcme,${longDesc}`;
    const result = parseLeadsCsv(csv);
    expect(result.leads[0]?.description).toHaveLength(2000);
  });

  it("soft-caps city/state/address/phone/email/tagline without skipping the row", () => {
    const csv = [
      "businessName,city,state,address,phone,email,tagline",
      [
        "Acme",
        "C".repeat(150),
        "S".repeat(60),
        "A".repeat(400),
        "1".repeat(80),
        `${"e".repeat(350)}@example.com`,
        "T".repeat(250),
      ].join(","),
    ].join("\n");
    const result = parseLeadsCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.leads).toHaveLength(1);
    const lead = result.leads[0]!;
    expect(lead.city).toHaveLength(100);
    expect(lead.state).toHaveLength(40);
    expect(lead.address).toHaveLength(300);
    expect(lead.phone).toHaveLength(40);
    expect(lead.email).toHaveLength(320);
    expect(lead.tagline).toHaveLength(200);
  });

  it("soft-caps each service token and hours weekday/weekend segments", () => {
    const longService = "S".repeat(150);
    const longWeekday = "W".repeat(150);
    const longWeekend = "E".repeat(150);
    const csv = [
      "businessName,services,hours",
      `Acme,${longService};Keep,${longWeekday} · ${longWeekend}`,
    ].join("\n");
    const result = parseLeadsCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.leads[0]?.services[0]).toHaveLength(100);
    expect(result.leads[0]?.services[1]).toBe("Keep");
    expect(result.leads[0]?.hours.weekday).toHaveLength(120);
    expect(result.leads[0]?.hours.weekend).toHaveLength(120);
  });
});

describe("partitionLeadsByExistingSlugs", () => {
  it("splits fresh inserts from slug collisions against the existing set", () => {
    const candidates = [
      { slug: "new-shop", businessName: "New Shop" },
      { slug: "old-shop", businessName: "Old Shop" },
      { slug: "also-new", businessName: "Also New" },
    ];
    const { fresh, collisions } = partitionLeadsByExistingSlugs(
      candidates,
      new Set(["old-shop"]),
    );
    expect(fresh.map((l) => l.slug)).toEqual(["new-shop", "also-new"]);
    expect(collisions.map((l) => l.slug)).toEqual(["old-shop"]);
  });

  it("treats an empty existing set as all-fresh", () => {
    const { fresh, collisions } = partitionLeadsByExistingSlugs([{ slug: "only" }], new Set());
    expect(fresh).toHaveLength(1);
    expect(collisions).toEqual([]);
  });
});

describe("existingLeadSlugConflictMessage", () => {
  it("names the colliding slug and says pipeline state is preserved", () => {
    expect(existingLeadSlugConflictMessage("blue-river-salon")).toMatch(/blue-river-salon/);
    expect(existingLeadSlugConflictMessage("blue-river-salon")).toMatch(/pipeline state/);
  });
});

describe("parseCsvImportText", () => {
  it("rejects non-string / empty / whitespace as missing", () => {
    expect(parseCsvImportText(undefined)).toEqual({
      ok: false,
      reason: "missing",
    });
    expect(parseCsvImportText(null)).toEqual({
      ok: false,
      reason: "missing",
    });
    expect(parseCsvImportText(42)).toEqual({
      ok: false,
      reason: "missing",
    });
    expect(parseCsvImportText("")).toEqual({
      ok: false,
      reason: "missing",
    });
    expect(parseCsvImportText("   \n\t")).toEqual({
      ok: false,
      reason: "missing",
    });
  });

  it("hard-rejects over MAX_CSV_IMPORT_TEXT_LENGTH (no soft-cap)", () => {
    const over = "x".repeat(MAX_CSV_IMPORT_TEXT_LENGTH + 1);
    expect(over.length).toBeGreaterThan(MAX_CSV_IMPORT_TEXT_LENGTH);
    expect(parseCsvImportText(over)).toEqual({
      ok: false,
      reason: "too_long",
    });
  });

  it("accepts exactly MAX_CSV_IMPORT_TEXT_LENGTH and returns the raw text", () => {
    const exact = "y".repeat(MAX_CSV_IMPORT_TEXT_LENGTH);
    expect(parseCsvImportText(exact)).toEqual({
      ok: true,
      csvText: exact,
    });
  });

  it("preserves leading/trailing whitespace on ok payloads (parseLeadsCsv owns trim)", () => {
    const csv = "  businessName\nDemo Cafe  ";
    expect(parseCsvImportText(csv)).toEqual({ ok: true, csvText: csv });
  });
});
