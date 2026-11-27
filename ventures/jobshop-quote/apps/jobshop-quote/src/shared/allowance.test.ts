import { describe, expect, it } from "vitest";
import {
  allowanceBanner,
  intakeNote,
  packageNote,
  reachedThreshold,
  thresholdCount,
} from "./allowance";
import type { BillingDto } from "./api";

function billing(used: number, allowance: number | null, checkoutAvailable = true): BillingDto {
  return {
    plan: { key: "shop", name: "Shop" },
    status: "active",
    lapsed: false,
    graceUntil: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    limits: { rfqsPerMonth: allowance, members: 5 },
    usage: { rfqsThisMonth: used, members: 2, pendingInvitations: 0 },
    allowanceResetsOn: "2026-12-01",
    checkoutAvailable,
    portalAvailable: true,
    plans: [],
  };
}

describe("thresholds", () => {
  it("rounds 80% up to a whole RFQ", () => {
    expect(thresholdCount(40, 80)).toBe(32);
    expect(thresholdCount(7, 80)).toBe(6);
    expect(reachedThreshold(31, 40)).toBeNull();
    expect(reachedThreshold(32, 40)).toBe(80);
    expect(reachedThreshold(45, 40)).toBe(100);
    expect(reachedThreshold(3, 0)).toBeNull();
  });
});

describe("allowanceBanner", () => {
  it("shows nothing below 80% or without an allowance", () => {
    expect(allowanceBanner(billing(31, 40), false)).toBeNull();
    expect(allowanceBanner(billing(500, null), false)).toBeNull();
  });

  it("tells a member at 80% the counts and who can change the plan", () => {
    const b = allowanceBanner(billing(32, 40), false);
    expect(b?.threshold).toBe(80);
    expect(b?.text).toContain("32 of 40");
    expect(b?.text).toContain("8 reads left");
    expect(b?.text).toContain("2026-12-01");
    expect(b?.linkToBilling).toBe(false);
    expect(b?.action).toContain("owner or admin");
  });

  it("at 100% says hand entry still works and gives admins the billing link", () => {
    const b = allowanceBanner(billing(40, 40), true);
    expect(b?.threshold).toBe(100);
    expect(b?.text).toContain("used all 40");
    expect(b?.text).toContain("entered by hand");
    expect(b?.linkToBilling).toBe(true);
    expect(b?.action).toContain("billing page");
  });

  it("never points at an upgrade while checkout is dark, and states no prices", () => {
    for (const admin of [true, false]) {
      const b = allowanceBanner(billing(39, 40, false), admin);
      expect(b?.action).not.toMatch(/larger allowance on the billing|need a larger plan/);
      expect(`${b?.text} ${b?.action}`).not.toMatch(/\$/);
    }
  });
});

describe("intakeNote", () => {
  it("stays off below 100% and on plans without an allowance", () => {
    expect(intakeNote(billing(39, 40), true)).toBeNull();
    expect(intakeNote(billing(32, 40), false)).toBeNull();
    expect(intakeNote(billing(900, null), true)).toBeNull();
  });

  it("at 100% says the RFQ is saved, not read, and relabels the button", () => {
    const n = intakeNote(billing(40, 40), false);
    expect(n?.text).toContain("saved but not read");
    expect(n?.text).toContain("by hand");
    expect(n?.text).toContain("2026-12-01");
    expect(n?.submitLabel).not.toMatch(/extract/i);
    expect(n?.linkToBilling).toBe(false);
  });

  it("past 100% (a multi-page RFQ took the last slots) still shows the note", () => {
    expect(intakeNote(billing(42, 40), true)?.linkToBilling).toBe(true);
  });

  it("uses the banner's action, so neither offers an upgrade while checkout is dark", () => {
    for (const admin of [true, false]) {
      const b = billing(40, 40, false);
      expect(intakeNote(b, admin)?.action).toBe(allowanceBanner(b, admin)?.action);
      expect(JSON.stringify(intakeNote(b, admin))).not.toMatch(/\$/);
    }
  });
});

describe("packageNote", () => {
  it("says nothing for a one-RFQ package, without an allowance, or once the month is used", () => {
    expect(packageNote(billing(39, 40), { pages: 10, units: 1 }, true)).toBeNull();
    expect(packageNote(billing(5, null), { pages: 95, units: 10 }, true)).toBeNull();
    // At 0 left intakeNote already speaks for the form.
    expect(packageNote(billing(40, 40), { pages: 25, units: 3 }, true)).toBeNull();
    expect(packageNote(billing(44, 40), { pages: 25, units: 3 }, true)).toBeNull();
  });

  it("tells the estimator how many RFQs a package that fits will use", () => {
    const n = packageNote(billing(10, 40), { pages: 23, units: 3 }, false);
    expect(n?.kind).toBe("counts");
    expect(n?.text).toContain("23 pages");
    expect(n?.text).toContain("uses 3 of this month's AI-read RFQs");
    expect(n?.text).toContain("30 are left on the Shop plan");
    expect(n?.submitLabel).toBeNull();
    expect(n?.action).toBeNull();
    // Exactly what is left still fits.
    expect(packageNote(billing(37, 40), { pages: 30, units: 3 }, false)?.kind).toBe("counts");
  });

  it("warns before submit when the package needs more than is left, even below 80%", () => {
    // 300-RFQ plan at 76%: no banner, and a 75-page package needing 8 of the 72 left fits.
    expect(packageNote(billing(228, 300), { pages: 75, units: 8 }, true)?.kind).toBe("counts");
    // 40-RFQ plan at 75%: no banner yet, and a 105-page set needs 11 of the 10 left.
    expect(allowanceBanner(billing(30, 40), true)).toBeNull();
    const n = packageNote(billing(30, 40), { pages: 105, units: 11 }, true);
    expect(n?.kind).toBe("short");
    expect(n?.text).toContain("105 pages");
    expect(n?.text).toContain("uses 11 of this month's AI-read RFQs");
    expect(n?.text).toContain("only 10 are left");
    expect(n?.text).toContain("saved but not read by the AI");
    expect(n?.text).toContain("2026-12-01");
    expect(n?.submitLabel).toBe("Create RFQ (enter parts by hand)");
    expect(n?.linkToBilling).toBe(true);
    expect(packageNote(billing(39, 40), { pages: 12, units: 2 }, false)?.text).toContain(
      "only 1 is left",
    );
  });

  it("uses the banner's action wording and never offers an upgrade while checkout is dark", () => {
    for (const admin of [true, false]) {
      for (const checkout of [true, false]) {
        const n = packageNote(billing(39, 40, checkout), { pages: 20, units: 2 }, admin);
        expect(n?.action).toBe(allowanceBanner(billing(40, 40, checkout), admin)?.action);
        expect(n?.linkToBilling).toBe(admin);
        expect(JSON.stringify(n)).not.toMatch(/\$/);
      }
    }
    expect(packageNote(billing(39, 40, false), { pages: 20, units: 2 }, true)?.action).toContain(
      "not on sale yet",
    );
  });
});
