import { describe, expect, it } from "vitest";
import {
  contactPersistOutcome,
  shouldSendContactNotify,
} from "./contact-persist";

describe("contactPersistOutcome", () => {
  it("returns 200 with inquiryId when persist succeeded", () => {
    expect(contactPersistOutcome("inq_demo_1")).toEqual({
      ok: true,
      status: 200,
      inquiryId: "inq_demo_1",
      message: "Thanks — your message was received.",
    });
  });

  it("returns 503 when persist failed (no inquiryId)", () => {
    expect(contactPersistOutcome(undefined)).toEqual({
      ok: false,
      status: 503,
      error:
        "Could not save your message right now. Please try again in a moment.",
    });
  });

  it("treats empty string as failure", () => {
    expect(contactPersistOutcome("").ok).toBe(false);
    expect(contactPersistOutcome("").status).toBe(503);
  });
});

describe("shouldSendContactNotify", () => {
  it("only sends after a durable inquiry row exists", () => {
    expect(shouldSendContactNotify("inq_1")).toBe(true);
    expect(shouldSendContactNotify(undefined)).toBe(false);
    expect(shouldSendContactNotify("")).toBe(false);
  });
});
