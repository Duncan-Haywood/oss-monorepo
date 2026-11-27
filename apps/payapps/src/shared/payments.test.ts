import { describe, expect, it } from "vitest";
import {
  expectedCents,
  MAX_OWNER_PAID_BATCH,
  ownerPaidManyProblem,
  ownerPaidProblem,
  paymentPosition,
  paymentProblem,
  receivedCents,
  shortBalanceCents,
  shortCloseProblem,
  statusAfterPayments,
  unrecordedPaidCents,
  unrecordedPaymentProblem,
} from "./payments";

const pay = (amountCents: number, receivedOn = "2026-03-10") => ({ amountCents, receivedOn });

describe("expectedCents / receivedCents", () => {
  it("uses the certified amount when the GC cut one, else line 8", () => {
    expect(expectedCents(900_000, 1_000_000)).toBe(900_000);
    expect(expectedCents(null, 1_000_000)).toBe(1_000_000);
    expect(expectedCents(0, 1_000_000)).toBe(0);
  });
  it("sums payments", () => {
    expect(receivedCents([])).toBe(0);
    expect(receivedCents([pay(1), pay(2)])).toBe(3);
  });
});

describe("paymentPosition", () => {
  it("a sent application with part of the money in is partial", () => {
    expect(
      paymentPosition("certified", 1_000_000, [
        pay(400_000, "2026-03-01"),
        pay(100_000, "2026-03-09"),
      ]),
    ).toEqual({
      expectedCents: 1_000_000,
      paidCents: 500_000,
      remainingCents: 500_000,
      partial: true,
      lastReceivedOn: "2026-03-09",
      closedShortCents: 0,
    });
  });
  it("nothing in: all owed, not partial", () => {
    expect(paymentPosition("submitted", 1_000_000, [])).toMatchObject({
      paidCents: 0,
      remainingCents: 1_000_000,
      partial: false,
      lastReceivedOn: null,
    });
  });
  it("paid means paid in full, whatever was recorded", () => {
    expect(paymentPosition("paid", 1_000_000, [pay(1)])).toMatchObject({
      paidCents: 1_000_000,
      remainingCents: 0,
      partial: false,
    });
  });
  it("a draft owes nothing yet", () => {
    expect(paymentPosition("draft", 1_000_000, [])).toMatchObject({
      paidCents: 0,
      remainingCents: 0,
    });
  });
});

describe("paymentProblem", () => {
  const today = "2026-03-15";
  it("accepts a payment up to what is still owed", () => {
    expect(paymentProblem("submitted", 1_000_000, [pay(400_000)], pay(600_000), today)).toBeNull();
  });
  it("refuses more than is owed, naming the balance", () => {
    expect(paymentProblem("certified", 1_000_000, [pay(400_000)], pay(600_001), today)).toBe(
      "That is more than the $6,000.00 still owed on this application",
    );
  });
  it("refuses drafts, paid applications, zero and future dates", () => {
    expect(paymentProblem("draft", 1, [], pay(1), today)).toMatch(/Submit the application/);
    expect(paymentProblem("paid", 1, [], pay(1), today)).toMatch(/already marked paid/);
    expect(paymentProblem("submitted", 1, [], pay(0), today)).toMatch(/more than \$0\.00/);
    expect(paymentProblem("submitted", 10, [], pay(1, "2026-03-16"), today)).toMatch(/future/);
  });
});

describe("statusAfterPayments", () => {
  it("turns paid once the payments reach the expected amount", () => {
    expect(statusAfterPayments("certified", 1_000, [pay(400), pay(599)])).toBe("certified");
    expect(statusAfterPayments("certified", 1_000, [pay(400), pay(600)])).toBe("paid");
    expect(statusAfterPayments("submitted", 1_000, [pay(1_000)])).toBe("paid");
  });
  it("leaves drafts and paid applications alone", () => {
    expect(statusAfterPayments("draft", 0, [])).toBe("draft");
    expect(statusAfterPayments("paid", 1_000, [])).toBe("paid");
  });
});

describe("closing short", () => {
  const app = { status: "certified" as const, applicationDate: "2026-02-28" };
  const close = { reason: "backcharge" as const, closedOn: "2026-03-20" };

  it("a paid application closed short counts only what came in as paid", () => {
    expect(paymentPosition("paid", 1_000_000, [pay(850_000)], 150_000)).toMatchObject({
      paidCents: 850_000,
      remainingCents: 0,
      closedShortCents: 150_000,
    });
  });
  it("a closed amount is ignored until the application is paid, and capped at expected", () => {
    expect(paymentPosition("certified", 1_000_000, [pay(850_000)], 150_000)).toMatchObject({
      paidCents: 850_000,
      remainingCents: 150_000,
      closedShortCents: 0,
    });
    expect(paymentPosition("paid", 100, [], 500)).toMatchObject({
      paidCents: 0,
      closedShortCents: 100,
    });
  });
  it("closes the balance left after the payments", () => {
    expect(shortBalanceCents(1_000_000, [pay(850_000)])).toBe(150_000);
    expect(shortBalanceCents(1_000_000, [])).toBe(1_000_000);
    expect(shortBalanceCents(100, [pay(100)])).toBe(0);
  });
  it("allows an open application with a balance", () => {
    expect(shortCloseProblem(app, 1_000_000, [pay(850_000)], close, "2026-03-25")).toBeNull();
    // A GC can withhold a whole application as a backcharge.
    expect(shortCloseProblem(app, 1_000_000, [], close, "2026-03-25")).toBeNull();
  });
  it("refuses drafts, paid applications, nothing owed and bad dates", () => {
    expect(shortCloseProblem({ ...app, status: "draft" }, 1, [], close, "2026-03-25")).toMatch(
      /Submit/,
    );
    expect(shortCloseProblem({ ...app, status: "paid" }, 1, [], close, "2026-03-25")).toMatch(
      /already/,
    );
    expect(shortCloseProblem(app, 100, [pay(100)], close, "2026-03-25")).toMatch(/Nothing/);
    expect(shortCloseProblem(app, 100, [], close, "2026-03-19")).toMatch(/future/);
    expect(
      shortCloseProblem(app, 100, [], { ...close, closedOn: "2026-02-01" }, "2026-03-25"),
    ).toMatch(/before the application/);
  });
});

describe("ownerPaidProblem", () => {
  const sent = { status: "submitted" as const, periodFrom: "2026-02-01" };
  it("records a past date on a sent application of a pay-when-paid job", () => {
    expect(ownerPaidProblem(sent, "owner_paid", "2026-03-01", "2026-03-10")).toBeNull();
    expect(ownerPaidProblem(sent, "owner_paid", "2026-03-10", "2026-03-10")).toBeNull();
    expect(
      ownerPaidProblem({ ...sent, status: "paid" }, "owner_paid", "2026-03-01", "2026-03-10"),
    ).toBeNull();
  });
  it("refuses drafts, other pay terms, future dates and dates before the period began", () => {
    expect(
      ownerPaidProblem({ ...sent, status: "draft" }, "owner_paid", "2026-03-01", "2026-03-10"),
    ).toMatch(/Submit/);
    expect(ownerPaidProblem(sent, "application_date", "2026-03-01", "2026-03-10")).toMatch(
      /pay-when-paid/,
    );
    expect(ownerPaidProblem(sent, "owner_paid", "2026-03-11", "2026-03-10")).toMatch(/future/);
    expect(ownerPaidProblem(sent, "owner_paid", "2026-01-31", "2026-03-10")).toMatch(
      /before the period/,
    );
  });
  it("always lets a sent application's date be cleared", () => {
    expect(ownerPaidProblem(sent, "period_end", null, "2026-03-10")).toBeNull();
    expect(
      ownerPaidProblem({ ...sent, status: "draft" }, "owner_paid", null, "2026-03-10"),
    ).toMatch(/Submit/);
  });
});

describe("ownerPaidManyProblem", () => {
  const app = (
    number: number,
    periodFrom: string,
    status: "submitted" | "draft" = "submitted",
  ) => ({
    number,
    status,
    periodFrom,
  });
  it("records one date on several sent applications when each could take it alone", () => {
    const apps = [app(2, "2026-02-01"), app(1, "2026-01-01")];
    expect(ownerPaidManyProblem(apps, "owner_paid", "2026-03-05", "2026-03-10")).toBeNull();
  });
  it("is all or nothing, naming the lowest application refused", () => {
    const [a3, a1] = [app(3, "2026-03-01"), app(1, "2026-01-01")];
    const apps = [a3, a1, app(2, "2026-02-01", "draft")];
    expect(ownerPaidManyProblem(apps, "owner_paid", "2026-02-20", "2026-03-10")).toBe(
      "Application #2: Submit the application before recording the owner's payment",
    );
    expect(ownerPaidManyProblem([a3, a1], "owner_paid", "2026-02-20", "2026-03-10")).toBe(
      "Application #3: The date cannot be before the period billed began",
    );
    expect(ownerPaidManyProblem([a1], "period_end", "2026-02-20", "2026-03-10")).toMatch(
      /^Application #1: .*pay-when-paid/,
    );
  });
  it("refuses an empty list and more than the batch limit", () => {
    expect(ownerPaidManyProblem([], "owner_paid", "2026-02-20", "2026-03-10")).toMatch(/at least/);
    const many = Array.from({ length: MAX_OWNER_PAID_BATCH + 1 }, (_, i) =>
      app(i + 1, "2026-01-01"),
    );
    expect(ownerPaidManyProblem(many, "owner_paid", "2026-02-20", "2026-03-10")).toMatch(/At most/);
  });
});

describe("unrecordedPaidCents", () => {
  it("is the money a paid application counts with no payment behind it", () => {
    expect(unrecordedPaidCents("paid", 10_000, [])).toBe(10_000);
    expect(unrecordedPaidCents("paid", 10_000, [{ amountCents: 4_000 }])).toBe(6_000);
    expect(unrecordedPaidCents("paid", 10_000, [{ amountCents: 10_000 }])).toBe(0);
  });
  it("never counts a balance closed short, nor anything on an unpaid application", () => {
    expect(unrecordedPaidCents("paid", 10_000, [{ amountCents: 8_000 }], 2_000)).toBe(0);
    expect(unrecordedPaidCents("certified", 10_000, [])).toBe(0);
    expect(unrecordedPaidCents("submitted", 10_000, [{ amountCents: 1 }])).toBe(0);
  });
  it("refuses with a reason", () => {
    expect(unrecordedPaymentProblem("submitted", 0, "2026-01-01", "2026-02-01")).toMatch(
      /marked paid/,
    );
    expect(unrecordedPaymentProblem("paid", 0, "2026-01-01", "2026-02-01")).toMatch(
      /already recorded/,
    );
    expect(unrecordedPaymentProblem("paid", 5, "2026-03-01", "2026-02-01")).toMatch(/future/);
    expect(unrecordedPaymentProblem("paid", 5, "2026-01-01", "2026-02-01")).toBeNull();
  });
});
