import { describe, expect, it } from "vitest";
import {
  mapDeployHandoffRow,
  parseDeployHandoffDnsInstructions,
  parseDeployHandoffNotes,
  type SqliteDeployHandoffRow,
} from "./sqlite-row-mapping";

const baseRow: SqliteDeployHandoffRow = {
  id: "dh_acme",
  leadSlug: "acme",
  businessName: "Acme Co",
  tier: "starter",
  commerceAddon: 0,
  stripeSessionId: "cs_test_1",
  customerEmail: "owner@acme.test",
  previewUrl: "https://example.com/preview/acme",
  suggestedHost: "acme.example.com",
  customDomain: null,
  contactFormUrl: "https://example.com/api/contact/acme",
  dnsInstructions: JSON.stringify([
    { type: "A", host: "@", value: "76.76.21.21", purpose: "root" },
  ]),
  status: "awaiting_dns",
  vercelDomainStatus: null,
  vercelProjectId: null,
  notes: JSON.stringify(["provisioned via API"]),
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("parseDeployHandoffDnsInstructions", () => {
  it("round-trips well-formed instructions", () => {
    const json = JSON.stringify([
      { type: "CNAME", host: "www", value: "cname.vercel-dns.com", purpose: "www" },
    ]);
    expect(parseDeployHandoffDnsInstructions(json)).toEqual([
      { type: "CNAME", host: "www", value: "cname.vercel-dns.com", purpose: "www" },
    ]);
  });

  it("degrades malformed JSON to []", () => {
    expect(parseDeployHandoffDnsInstructions("{not json")).toEqual([]);
  });

  it("degrades a non-array JSON value to [] instead of returning it as-is", () => {
    expect(parseDeployHandoffDnsInstructions(JSON.stringify({ type: "A" }))).toEqual([]);
    expect(parseDeployHandoffDnsInstructions(JSON.stringify("A"))).toEqual([]);
    expect(parseDeployHandoffDnsInstructions(JSON.stringify(5))).toEqual([]);
  });

  it("filters out elements with an invalid type or missing fields", () => {
    const json = JSON.stringify([
      { type: "A", host: "@", value: "76.76.21.21", purpose: "root" },
      { type: "MX", host: "@", value: "mail", purpose: "invalid-type" },
      { type: "TXT", host: "@", purpose: "missing value" },
      "not-an-object",
    ]);
    expect(parseDeployHandoffDnsInstructions(json)).toEqual([
      { type: "A", host: "@", value: "76.76.21.21", purpose: "root" },
    ]);
  });
});

describe("parseDeployHandoffNotes", () => {
  it("round-trips well-formed notes", () => {
    expect(parseDeployHandoffNotes(JSON.stringify(["a", "b"]))).toEqual(["a", "b"]);
  });

  it("degrades malformed JSON to []", () => {
    expect(parseDeployHandoffNotes("{not json")).toEqual([]);
  });

  it("degrades a non-array JSON value to [] instead of returning it as-is", () => {
    expect(parseDeployHandoffNotes(JSON.stringify({ note: "x" }))).toEqual([]);
    expect(parseDeployHandoffNotes(JSON.stringify("just a string"))).toEqual([]);
  });

  it("filters out non-string elements", () => {
    expect(parseDeployHandoffNotes(JSON.stringify(["ok", 5, null, "also ok"]))).toEqual([
      "ok",
      "also ok",
    ]);
  });
});

describe("mapDeployHandoffRow", () => {
  it("maps a well-formed row", () => {
    expect(mapDeployHandoffRow(baseRow)).toEqual({
      id: "dh_acme",
      leadSlug: "acme",
      businessName: "Acme Co",
      tier: "starter",
      commerceAddon: false,
      stripeSessionId: "cs_test_1",
      customerEmail: "owner@acme.test",
      previewUrl: "https://example.com/preview/acme",
      suggestedHost: "acme.example.com",
      customDomain: undefined,
      contactFormUrl: "https://example.com/api/contact/acme",
      dnsInstructions: [{ type: "A", host: "@", value: "76.76.21.21", purpose: "root" }],
      status: "awaiting_dns",
      vercelDomainStatus: undefined,
      vercelProjectId: undefined,
      notes: ["provisioned via API"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("maps commerceAddon=1 to true and preserves optional fields", () => {
    const row: SqliteDeployHandoffRow = {
      ...baseRow,
      commerceAddon: 1,
      customDomain: "client-domain.com",
      vercelDomainStatus: "verified",
      vercelProjectId: "prj_123",
    };
    const mapped = mapDeployHandoffRow(row);
    expect(mapped.commerceAddon).toBe(true);
    expect(mapped.customDomain).toBe("client-domain.com");
    expect(mapped.vercelDomainStatus).toBe("verified");
    expect(mapped.vercelProjectId).toBe("prj_123");
  });

  it("survives a corrupted dnsInstructions/notes column without throwing", () => {
    const row: SqliteDeployHandoffRow = {
      ...baseRow,
      dnsInstructions: "not json at all",
      notes: JSON.stringify({ corrupted: true }),
    };
    expect(() => mapDeployHandoffRow(row)).not.toThrow();
    const mapped = mapDeployHandoffRow(row);
    expect(mapped.dnsInstructions).toEqual([]);
    expect(mapped.notes).toEqual([]);
  });
});
