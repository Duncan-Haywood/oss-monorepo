import { describe, expect, it } from "vitest";
import { changedFields, describePayAppEvent } from "./pay-app-history";

describe("describePayAppEvent", () => {
  it("names the other applications an owner's payment was recorded with", () => {
    const d = { date: "2026-03-05" };
    expect(describePayAppEvent("owner_payment_recorded", 2, d)).toBe(
      "Owner's payment to the GC for application #2 recorded as 2026-03-05",
    );
    expect(describePayAppEvent("owner_payment_recorded", 2, { ...d, together: [1] })).toBe(
      "Owner's payment to the GC for application #2 recorded as 2026-03-05, together with application #1",
    );
    expect(describePayAppEvent("owner_payment_recorded", 2, { ...d, together: [1, 3, 4] })).toBe(
      "Owner's payment to the GC for application #2 recorded as 2026-03-05, together with applications #1, #3 and #4",
    );
  });
  it("names the money, dates and references an event carries", () => {
    expect(describePayAppEvent("submitted", 3, { amountCents: 4_500_000 })).toBe(
      "Application #3 submitted for $45,000.00 (line 8)",
    );
    expect(
      describePayAppEvent("payment_recorded", 3, {
        amountCents: 100_000,
        date: "2026-02-01",
        reference: "ACH 77",
        status: "paid",
      }),
    ).toBe("Payment of $1,000.00 received 2026-02-01 (ACH 77) recorded; now paid in full");
    expect(
      describePayAppEvent("waiver_status_changed", 3, {
        waiverKind: "conditional-progress",
        waiverStatus: "sent",
        amountCents: 100_000,
      }),
    ).toBe("Conditional progress lien waiver for $1,000.00 marked sent");
    expect(describePayAppEvent("details_changed", 2, { fields: ["periodTo", "notes"] })).toBe(
      "Application #2: changed period end, notes",
    );
    expect(describePayAppEvent("certified", 1, { amountCents: 5, status: "paid" })).toBe(
      "Application #1 certified by the GC at $0.05; already paid in full",
    );
  });
});

describe("changedFields", () => {
  it("lists only values that differ, treating missing and null alike", () => {
    expect(
      changedFields(
        { periodTo: "2026-01-31", notes: null, applicationDate: "2026-01-31" },
        { periodTo: "2026-01-31", notes: "x", applicationDate: undefined },
      ),
    ).toEqual(["notes"]);
    expect(changedFields({ notes: null }, { notes: null })).toEqual([]);
  });
});
