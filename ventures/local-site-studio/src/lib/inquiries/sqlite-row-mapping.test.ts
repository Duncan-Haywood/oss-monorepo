import { describe, expect, it } from "vitest";
import { mapClientInquiryRow, type SqliteClientInquiryRow } from "./sqlite-row-mapping";

const baseRow: SqliteClientInquiryRow = {
  id: "inq_1",
  leadSlug: "acme",
  businessName: "Acme Co",
  name: null,
  email: null,
  phone: null,
  message: "Do you have gluten-free options?",
  status: "new",
  source: null,
  operatorReply: null,
  repliedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("mapClientInquiryRow", () => {
  it("maps a sparse row, converting null optionals to undefined", () => {
    expect(mapClientInquiryRow(baseRow)).toEqual({
      id: "inq_1",
      leadSlug: "acme",
      businessName: "Acme Co",
      name: undefined,
      email: undefined,
      phone: undefined,
      message: "Do you have gluten-free options?",
      status: "new",
      source: undefined,
      operatorReply: undefined,
      repliedAt: undefined,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("preserves optional fields when present", () => {
    const row: SqliteClientInquiryRow = {
      ...baseRow,
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "555-1212",
      source: "preview",
      operatorReply: "Yes, we do!",
      repliedAt: "2026-01-02T00:00:00.000Z",
      status: "replied",
    };
    expect(mapClientInquiryRow(row)).toMatchObject({
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "555-1212",
      source: "preview",
      operatorReply: "Yes, we do!",
      repliedAt: "2026-01-02T00:00:00.000Z",
      status: "replied",
    });
  });
});
