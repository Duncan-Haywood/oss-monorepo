import { describe, expect, it } from "vitest";
import { sumCommerceOrdersRevenueUsd } from "./orders";

describe("sumCommerceOrdersRevenueUsd", () => {
  it("sums amountPaidUsd across orders", () => {
    expect(
      sumCommerceOrdersRevenueUsd([
        { amountPaidUsd: 12.5 },
        { amountPaidUsd: 7.25 },
      ]),
    ).toBe(19.75);
  });

  it("returns 0 for an empty list", () => {
    expect(sumCommerceOrdersRevenueUsd([])).toBe(0);
  });

  it("ignores non-finite amounts defensively", () => {
    expect(
      sumCommerceOrdersRevenueUsd([
        { amountPaidUsd: 10 },
        { amountPaidUsd: Number.NaN },
      ]),
    ).toBe(10);
  });
});
