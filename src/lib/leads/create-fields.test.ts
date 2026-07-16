import { describe, expect, it } from "vitest";
import {
  MAX_ADDRESS_LENGTH,
  MAX_BUSINESS_NAME_LENGTH,
  MAX_CITY_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_HOURS_SEGMENT_LENGTH,
  MAX_LEAD_DATA_SOURCE_LENGTH,
  MAX_LEAD_EMAIL_LENGTH,
  MAX_LEAD_PHONE_LENGTH,
  MAX_SERVICE_ITEM_LENGTH,
  MAX_SERVICES,
  MAX_STATE_LENGTH,
  MAX_TAGLINE_LENGTH,
  normalizeLeadCreateFields,
  normalizeLeadDataSource,
} from "./create-fields";

const base = {
  businessName: "Demo Cafe",
  city: "Austin",
  state: "TX",
  phone: "(512) 555-0100",
  tagline: "Coffee",
  description: "A neighborhood cafe",
  services: ["Coffee", "Pastries"],
  hours: { weekday: "Mon–Fri 7am–3pm", weekend: "Sat 8am–2pm" },
};

describe("normalizeLeadCreateFields", () => {
  it("accepts a normal lead and trims strings", () => {
    const result = normalizeLeadCreateFields({
      ...base,
      businessName: "  Demo Cafe  ",
      email: "  owner@demo.cafe  ",
      address: "  100 Main St  ",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fields.businessName).toBe("Demo Cafe");
    expect(result.fields.email).toBe("owner@demo.cafe");
    expect(result.fields.address).toBe("100 Main St");
  });

  it("rejects empty businessName", () => {
    const result = normalizeLeadCreateFields({ ...base, businessName: "   " });
    expect(result).toEqual({
      ok: false,
      error: "Business Name is required",
    });
  });

  it("hard-rejects over-long businessName", () => {
    const result = normalizeLeadCreateFields({
      ...base,
      businessName: "A".repeat(MAX_BUSINESS_NAME_LENGTH + 1),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain(String(MAX_BUSINESS_NAME_LENGTH));
  });

  it("soft-caps optional text fields without rejecting", () => {
    const result = normalizeLeadCreateFields({
      ...base,
      city: "c".repeat(MAX_CITY_LENGTH + 20),
      state: "s".repeat(MAX_STATE_LENGTH + 5),
      address: "a".repeat(MAX_ADDRESS_LENGTH + 50),
      phone: "1".repeat(MAX_LEAD_PHONE_LENGTH + 10),
      email: `${"e".repeat(MAX_LEAD_EMAIL_LENGTH)}@x.com`,
      tagline: "t".repeat(MAX_TAGLINE_LENGTH + 10),
      description: "d".repeat(MAX_DESCRIPTION_LENGTH + 100),
      hours: {
        weekday: "w".repeat(MAX_HOURS_SEGMENT_LENGTH + 10),
        weekend: "e".repeat(MAX_HOURS_SEGMENT_LENGTH + 10),
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fields.city).toHaveLength(MAX_CITY_LENGTH);
    expect(result.fields.state).toHaveLength(MAX_STATE_LENGTH);
    expect(result.fields.address).toHaveLength(MAX_ADDRESS_LENGTH);
    expect(result.fields.phone).toHaveLength(MAX_LEAD_PHONE_LENGTH);
    expect(result.fields.email).toHaveLength(MAX_LEAD_EMAIL_LENGTH);
    expect(result.fields.tagline).toHaveLength(MAX_TAGLINE_LENGTH);
    expect(result.fields.description).toHaveLength(MAX_DESCRIPTION_LENGTH);
    expect(result.fields.hours.weekday).toHaveLength(MAX_HOURS_SEGMENT_LENGTH);
    expect(result.fields.hours.weekend).toHaveLength(MAX_HOURS_SEGMENT_LENGTH);
  });

  it("soft-caps each service token and caps service count", () => {
    const many = Array.from({ length: MAX_SERVICES + 5 }, (_, i) =>
      `${"svc".repeat(40)}-${i}`,
    );
    const result = normalizeLeadCreateFields({ ...base, services: many });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fields.services).toHaveLength(MAX_SERVICES);
    for (const svc of result.fields.services) {
      expect(svc.length).toBeLessThanOrEqual(MAX_SERVICE_ITEM_LENGTH);
    }
  });

  it("defaults empty services to a single placeholder", () => {
    const result = normalizeLeadCreateFields({ ...base, services: ["  ", ""] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fields.services).toEqual(["Custom digital setup"]);
  });
});

describe("normalizeLeadDataSource", () => {
  it("trims a normal tag and preserves built-ins under the max", () => {
    expect(normalizeLeadDataSource("  csv_import  ", "manual_entry")).toBe(
      "csv_import",
    );
    expect(normalizeLeadDataSource("manual_entry", "csv_import")).toBe(
      "manual_entry",
    );
  });

  it("falls back when missing, blank, or non-string", () => {
    expect(normalizeLeadDataSource(undefined, "csv_import")).toBe("csv_import");
    expect(normalizeLeadDataSource("   ", "manual_entry")).toBe("manual_entry");
    expect(normalizeLeadDataSource(123, "csv_import")).toBe("csv_import");
  });

  it("soft-caps over-long tags without hard-rejecting", () => {
    const long = "x".repeat(MAX_LEAD_DATA_SOURCE_LENGTH + 40);
    const capped = normalizeLeadDataSource(long, "csv_import");
    expect(capped).toHaveLength(MAX_LEAD_DATA_SOURCE_LENGTH);
    expect(capped).toBe("x".repeat(MAX_LEAD_DATA_SOURCE_LENGTH));
  });

  it("soft-caps an over-long fallback too", () => {
    const longFallback = "f".repeat(MAX_LEAD_DATA_SOURCE_LENGTH + 10);
    expect(normalizeLeadDataSource("", longFallback)).toHaveLength(
      MAX_LEAD_DATA_SOURCE_LENGTH,
    );
  });
});
