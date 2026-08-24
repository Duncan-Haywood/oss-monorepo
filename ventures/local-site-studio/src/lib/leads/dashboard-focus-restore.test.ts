import { describe, expect, it } from "vitest";

import {
  inquiryReplyToggleElementId,
  leadCommerceToggleElementId,
  leadNotesToggleElementId,
} from "./dashboard-focus-restore";

describe("leadNotesToggleElementId", () => {
  it("is keyed by lead slug", () => {
    expect(leadNotesToggleElementId("example-bakery")).toBe(
      "lead-notes-toggle-example-bakery",
    );
  });

  it("produces distinct ids for two different leads", () => {
    expect(leadNotesToggleElementId("example-bakery")).not.toBe(
      leadNotesToggleElementId("other-salon"),
    );
  });
});

describe("leadCommerceToggleElementId", () => {
  it("is keyed by lead slug", () => {
    expect(leadCommerceToggleElementId("example-bakery")).toBe(
      "lead-commerce-toggle-example-bakery",
    );
  });

  it("does not collide with the notes toggle id for the same lead", () => {
    expect(leadCommerceToggleElementId("example-bakery")).not.toBe(
      leadNotesToggleElementId("example-bakery"),
    );
  });
});

describe("inquiryReplyToggleElementId", () => {
  it("is keyed by inquiry id", () => {
    expect(inquiryReplyToggleElementId("inq_123")).toBe(
      "inquiry-reply-toggle-inq_123",
    );
  });

  it("produces distinct ids for two different inquiries", () => {
    expect(inquiryReplyToggleElementId("inq_123")).not.toBe(
      inquiryReplyToggleElementId("inq_456"),
    );
  });
});
