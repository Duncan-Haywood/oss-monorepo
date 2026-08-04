import { describe, expect, it } from "vitest";
import { describeUndeliveredEmail, emailWasDelivered } from "./delivery";

describe("emailWasDelivered", () => {
  it("returns true when email was successfully delivered (not mock)", () => {
    expect(emailWasDelivered({ success: true })).toBe(true);
    expect(emailWasDelivered({ success: true, mock: false })).toBe(true);
    expect(emailWasDelivered({ success: true, emailId: "msg_123" })).toBe(true);
  });

  it("returns false when success is false", () => {
    expect(emailWasDelivered({ success: false })).toBe(false);
    expect(emailWasDelivered({ success: false, reason: "suppressed" })).toBe(false);
    expect(emailWasDelivered({ success: false, error: "API error" })).toBe(false);
  });

  it("returns false when success is true but send was a mock", () => {
    expect(emailWasDelivered({ success: true, mock: true })).toBe(false);
  });

  it("returns false for null or undefined input", () => {
    expect(emailWasDelivered(null)).toBe(false);
    expect(emailWasDelivered(undefined)).toBe(false);
  });
});

describe("describeUndeliveredEmail", () => {
  it("returns 'no result' when result is null or undefined", () => {
    expect(describeUndeliveredEmail(null)).toBe("no result");
    expect(describeUndeliveredEmail(undefined)).toBe("no result");
  });

  it("explains mock sends clearly", () => {
    expect(describeUndeliveredEmail({ success: true, mock: true })).toContain("mock send");
  });

  it("returns reason when present", () => {
    expect(describeUndeliveredEmail({ success: false, reason: "suppressed" })).toBe("suppressed");
  });

  it("returns error when reason is missing but error is present", () => {
    expect(describeUndeliveredEmail({ success: false, error: "Network timeout" })).toBe("Network timeout");
  });

  it("returns 'unknown' when neither reason nor error is provided", () => {
    expect(describeUndeliveredEmail({ success: false })).toBe("unknown");
  });
});
