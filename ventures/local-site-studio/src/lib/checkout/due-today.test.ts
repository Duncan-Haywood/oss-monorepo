import { describe, expect, it } from "vitest";
import { getBundle } from "@/lib/pricing/bundles";
import { checkoutDueTodaySubtitle, checkoutSetupFeeTotal } from "./due-today";

const growth = getBundle("growth")!;
const starter = getBundle("starter")!;

describe("checkoutSetupFeeTotal", () => {
  it("charges the full bundle setup fee when not waived", () => {
    expect(checkoutSetupFeeTotal(growth, false, false)).toBe(500);
  });

  it("omits the bundle setup fee when waived (checkout-setup-fee-skip-on-upgrade)", () => {
    expect(checkoutSetupFeeTotal(growth, false, true)).toBe(0);
  });

  it("still charges the Commerce add-on's own setup fee even when the bundle setup fee is waived", () => {
    expect(checkoutSetupFeeTotal(growth, true, true)).toBe(300);
  });

  it("adds both setup fees when neither is waived and Commerce is selected", () => {
    expect(checkoutSetupFeeTotal(starter, true, false)).toBe(500 + 300);
  });
});

describe("checkoutDueTodaySubtitle", () => {
  it("describes a normal monthly purchase", () => {
    expect(
      checkoutDueTodaySubtitle({ recurringTotal: 99, billingInterval: "monthly", setupFeeWaived: false }),
    ).toBe("Setup fee + first month");
  });

  it("describes a normal annual purchase", () => {
    expect(
      checkoutDueTodaySubtitle({ recurringTotal: 990, billingInterval: "annual", setupFeeWaived: false }),
    ).toBe("Setup fee + first year");
  });

  it("describes a one-time-only purchase (Starter, no recurring price)", () => {
    expect(
      checkoutDueTodaySubtitle({ recurringTotal: 0, billingInterval: "monthly", setupFeeWaived: false }),
    ).toBe("Setup fee, one-time");
  });

  it("describes a waived-setup monthly upgrade without ever mentioning a setup fee", () => {
    const subtitle = checkoutDueTodaySubtitle({
      recurringTotal: 199,
      billingInterval: "monthly",
      setupFeeWaived: true,
    });
    expect(subtitle).toBe("First month only — setup already covered");
    expect(subtitle).not.toContain("Setup fee");
  });

  it("describes a waived-setup annual upgrade", () => {
    expect(
      checkoutDueTodaySubtitle({ recurringTotal: 1990, billingInterval: "annual", setupFeeWaived: true }),
    ).toBe("First year only — setup already covered");
  });

  it("describes the degenerate waived+no-recurring case without claiming a false total (route.ts rejects this combination with a 400 before it ever reaches Stripe)", () => {
    expect(
      checkoutDueTodaySubtitle({ recurringTotal: 0, billingInterval: "monthly", setupFeeWaived: true }),
    ).toBe("Nothing due today — setup already covered");
  });
});
