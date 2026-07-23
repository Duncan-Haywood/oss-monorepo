import { describe, expect, it } from "vitest";
import {
  mapSqliteRowToLead,
  parseLeadBufferProfileIds,
  parseLeadHours,
  parseLeadServices,
  serializeLeadBufferProfileIds,
  serializeLeadHours,
  serializeLeadServices,
  type SqliteLeadRow,
} from "./sqlite-row-mapping";

function baseRow(overrides: Partial<SqliteLeadRow> = {}): SqliteLeadRow {
  return {
    id: "lead_1",
    slug: "acme-cafe",
    businessName: "Acme Cafe",
    category: "restaurant",
    city: "Denver",
    status: "discovered",
    ...overrides,
  };
}

describe("serializeLeadHours / parseLeadHours round-trip", () => {
  it("keeps weekday and weekend separated by the '·' delimiter", () => {
    const hours = { weekday: "Mon–Fri 9am–5pm", weekend: "Sat–Sun 10am–2pm" };
    const stored = serializeLeadHours(hours);
    expect(stored).toBe("Mon–Fri 9am–5pm · Sat–Sun 10am–2pm");
    expect(parseLeadHours(stored)).toEqual(hours);
  });

  it("omits the delimiter entirely when weekend is empty (no 'undefined'/trailing '· ' artifact)", () => {
    const hours = { weekday: "Mon–Fri 9am–5pm", weekend: "" };
    const stored = serializeLeadHours(hours);
    expect(stored).toBe("Mon–Fri 9am–5pm");
    expect(parseLeadHours(stored)).toEqual(hours);
  });

  it("still recovers an empty weekend from the legacy '<weekday> · ' format with a trailing delimiter", () => {
    expect(parseLeadHours("Mon–Fri 9am–5pm · ")).toEqual({
      weekday: "Mon–Fri 9am–5pm",
      weekend: "",
    });
  });

  it("preserves additional · characters in the weekend value (CSV import default bug regression)", () => {
    const stored = serializeLeadHours({
      weekday: "Mon–Fri 9am–5pm",
      weekend: "Sat 10am–2pm · Closed Sun",
    });
    expect(parseLeadHours(stored)).toEqual({
      weekday: "Mon–Fri 9am–5pm",
      weekend: "Sat 10am–2pm · Closed Sun",
    });
  });

  it("falls back to the documented default hours when the column is null/undefined/empty", () => {
    const fallback = { weekday: "Mon–Fri 9am–5pm", weekend: "Sat–Sun Closed" };
    expect(parseLeadHours(null)).toEqual(fallback);
    expect(parseLeadHours(undefined)).toEqual(fallback);
    expect(parseLeadHours("")).toEqual(fallback);
  });
});

describe("serializeLeadServices / parseLeadServices round-trip", () => {
  it("round-trips an ordinary services array", () => {
    const services = ["Espresso", "Pastries", "Catering"];
    expect(parseLeadServices(serializeLeadServices(services))).toEqual(services);
  });

  it("round-trips an empty array", () => {
    expect(parseLeadServices(serializeLeadServices([]))).toEqual([]);
  });

  it("returns [] for a null/undefined/empty column instead of throwing", () => {
    expect(parseLeadServices(null)).toEqual([]);
    expect(parseLeadServices(undefined)).toEqual([]);
    expect(parseLeadServices("")).toEqual([]);
  });

  it("returns [] for malformed JSON instead of throwing", () => {
    expect(parseLeadServices("{not valid json")).toEqual([]);
  });

  it("returns [] when the JSON parses but isn't an array", () => {
    expect(parseLeadServices('{"weekday":"x"}')).toEqual([]);
  });
});

describe("serializeLeadBufferProfileIds / parseLeadBufferProfileIds round-trip", () => {
  it("round-trips an ordinary profile id array", () => {
    const ids = ["p1", "p2"];
    expect(parseLeadBufferProfileIds(serializeLeadBufferProfileIds(ids))).toEqual(ids);
  });

  it("returns undefined (not []) for an empty array, so the dormant-state check stays a simple truthy length check", () => {
    expect(parseLeadBufferProfileIds(serializeLeadBufferProfileIds([]))).toBeUndefined();
  });

  it("returns undefined for a null/undefined/empty column instead of throwing", () => {
    expect(parseLeadBufferProfileIds(null)).toBeUndefined();
    expect(parseLeadBufferProfileIds(undefined)).toBeUndefined();
    expect(parseLeadBufferProfileIds("")).toBeUndefined();
  });

  it("returns undefined for malformed JSON instead of throwing", () => {
    expect(parseLeadBufferProfileIds("{not valid json")).toBeUndefined();
  });

  it("returns undefined when the JSON parses but isn't an array", () => {
    expect(parseLeadBufferProfileIds('{"weekday":"x"}')).toBeUndefined();
  });
});

describe("mapSqliteRowToLead", () => {
  it("maps a fully-populated row through unchanged", () => {
    const row = baseRow({
      state: "CA",
      address: "123 Main St",
      phone: "555-123-4567",
      email: "owner@acmecafe.test",
      hours: "Mon–Fri 7am–7pm · Sat–Sun 8am–4pm",
      services: JSON.stringify(["Espresso", "Pastries"]),
      tagline: "Best brew in town",
      description: "Custom description",
      recommendedTier: "growth",
      dataSource: "csv_import",
      outreachStep: 2,
      lastOutreachAt: "2026-07-01T00:00:00.000Z",
      lastPreviewOpenAt: "2026-07-02T00:00:00.000Z",
      notes: "Called twice, interested",
      snoozedUntil: "2026-08-01T00:00:00.000Z",
    });

    expect(mapSqliteRowToLead(row)).toEqual({
      slug: "acme-cafe",
      businessName: "Acme Cafe",
      category: "restaurant",
      city: "Denver",
      state: "CA",
      address: "123 Main St",
      tagline: "Best brew in town",
      description: "Custom description",
      phone: "555-123-4567",
      email: "owner@acmecafe.test",
      services: ["Espresso", "Pastries"],
      hours: { weekday: "Mon–Fri 7am–7pm", weekend: "Sat–Sun 8am–4pm" },
      stage: "discovered",
      recommendedTier: "growth",
      dataSource: "csv_import",
      outreachStep: 2,
      lastOutreachAt: "2026-07-01T00:00:00.000Z",
      lastPreviewOpenAt: "2026-07-02T00:00:00.000Z",
      notes: "Called twice, interested",
      snoozedUntil: "2026-08-01T00:00:00.000Z",
    });
  });

  it("applies category/tier/state/phone/tagline/description defaults on a sparse row", () => {
    const lead = mapSqliteRowToLead(baseRow({ category: "unknown-category" }));
    expect(lead.category).toBe("generic");
    expect(lead.state).toBe("CO");
    expect(lead.phone).toBe("(555) 000-0000");
    expect(lead.address).toBeUndefined();
    expect(lead.email).toBeUndefined();
    expect(lead.tagline).toBe("Local favorites made fresh daily");
    expect(lead.description).toContain("Acme Cafe");
    expect(lead.recommendedTier).toBe("growth");
    expect(lead.services).toEqual([]);
    expect(lead.hours).toEqual({ weekday: "Mon–Fri 9am–5pm", weekend: "Sat–Sun Closed" });
  });

  it("derives category-specific recommendedTier/tagline defaults when recommendedTier column is absent", () => {
    const trades = mapSqliteRowToLead(baseRow({ category: "trades", tagline: null }));
    expect(trades.recommendedTier).toBe("starter");
    expect(trades.tagline).toBe("Professional services you can count on");

    const salon = mapSqliteRowToLead(baseRow({ category: "salon", tagline: null }));
    expect(salon.recommendedTier).toBe("complete");
    expect(salon.tagline).toBe("Tailored styling and care");
  });

  it("ignores an out-of-range recommendedTier column and falls back to the category default", () => {
    const lead = mapSqliteRowToLead(
      baseRow({ category: "trades", recommendedTier: "not-a-real-tier" }),
    );
    expect(lead.recommendedTier).toBe("starter");
  });

  it("normalizes an out-of-range outreachStep to 0", () => {
    expect(mapSqliteRowToLead(baseRow({ outreachStep: 99 })).outreachStep).toBe(0);
    expect(mapSqliteRowToLead(baseRow({ outreachStep: null })).outreachStep).toBe(0);
  });

  it("parses bufferProfileIds JSON and leaves it undefined when absent", () => {
    const withProfiles = mapSqliteRowToLead(
      baseRow({ bufferProfileIds: JSON.stringify(["p1", "p2"]) }),
    );
    expect(withProfiles.bufferProfileIds).toEqual(["p1", "p2"]);

    expect(mapSqliteRowToLead(baseRow()).bufferProfileIds).toBeUndefined();
  });
});
