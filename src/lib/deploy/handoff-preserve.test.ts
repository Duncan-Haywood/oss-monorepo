import { describe, expect, it } from "vitest";
import {
  isProgressedHandoffStatus,
  mergeProvisionOntoFreshHandoff,
  preferAdvancedHandoffStatus,
  preserveDeployHandoffOperatorFields,
} from "./handoff-preserve";
import type { DeployHandoff } from "./types";

function baseHandoff(overrides: Partial<DeployHandoff> = {}): DeployHandoff {
  return {
    id: "deploy_test_1",
    leadSlug: "joes-plumbing",
    businessName: "Joe's Plumbing",
    tier: "starter",
    commerceAddon: false,
    stripeSessionId: "cs_new",
    customerEmail: "joe@example.com",
    previewUrl: "https://app.example/preview/joes-plumbing",
    suggestedHost: "joes-plumbing.localsitestudio.com",
    contactFormUrl: "https://app.example/api/contact/joes-plumbing",
    dnsInstructions: [],
    status: "awaiting_dns",
    notes: ["fresh"],
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
    ...overrides,
  };
}

describe("isProgressedHandoffStatus", () => {
  it("treats live and provisioned as progressed", () => {
    expect(isProgressedHandoffStatus("live")).toBe(true);
    expect(isProgressedHandoffStatus("provisioned")).toBe(true);
    expect(isProgressedHandoffStatus("awaiting_dns")).toBe(false);
    expect(isProgressedHandoffStatus("pending")).toBe(false);
    expect(isProgressedHandoffStatus("failed")).toBe(false);
  });
});

describe("preferAdvancedHandoffStatus", () => {
  it("keeps live when a stale awaiting_dns marker write would otherwise downgrade", () => {
    // Bundle webhook receipt/DNS markers pass handoff.status from before Resend;
    // concurrent Mark live must win.
    expect(preferAdvancedHandoffStatus("live", "awaiting_dns")).toBe("live");
    expect(preferAdvancedHandoffStatus("live", "provisioned")).toBe("live");
    expect(preferAdvancedHandoffStatus("provisioned", "awaiting_dns")).toBe(
      "provisioned",
    );
  });

  it("allows intentional upgrades (Mark live / provision)", () => {
    expect(preferAdvancedHandoffStatus("awaiting_dns", "live")).toBe("live");
    expect(preferAdvancedHandoffStatus("awaiting_dns", "provisioned")).toBe(
      "provisioned",
    );
    expect(preferAdvancedHandoffStatus("failed", "awaiting_dns")).toBe(
      "awaiting_dns",
    );
  });

  it("prefers requested when ranks are equal (same-status note append)", () => {
    expect(preferAdvancedHandoffStatus("awaiting_dns", "awaiting_dns")).toBe(
      "awaiting_dns",
    );
    expect(preferAdvancedHandoffStatus("live", "live")).toBe("live");
    // pending and failed share rank 0 — requested wins so callers can move either way.
    expect(preferAdvancedHandoffStatus("failed", "pending")).toBe("pending");
    expect(preferAdvancedHandoffStatus("pending", "failed")).toBe("failed");
  });
});

describe("preserveDeployHandoffOperatorFields", () => {
  it("returns next unchanged when there is no existing handoff", () => {
    const next = baseHandoff();
    expect(preserveDeployHandoffOperatorFields(next, null)).toEqual(next);
    expect(preserveDeployHandoffOperatorFields(next, undefined)).toEqual(next);
  });

  it("copies customDomain and vercelProjectId from existing when next omits them", () => {
    const existing = baseHandoff({
      stripeSessionId: "cs_old",
      customDomain: "joesplumbing.com",
      vercelProjectId: "prj_dedicated",
      status: "awaiting_dns",
      notes: ["old"],
    });
    const next = baseHandoff({ stripeSessionId: "cs_new", notes: ["fresh"] });

    expect(preserveDeployHandoffOperatorFields(next, existing)).toEqual({
      ...next,
      customDomain: "joesplumbing.com",
      vercelProjectId: "prj_dedicated",
    });
  });

  it("preserves live status, notes, and vercelDomainStatus on upsell rebuild", () => {
    const existing = baseHandoff({
      stripeSessionId: "cs_old",
      customDomain: "joesplumbing.com",
      vercelProjectId: "prj_dedicated",
      status: "live",
      vercelDomainStatus: "already_exists",
      notes: ["Operator confirmed DNS / publish — lead marked live."],
    });
    const next = baseHandoff({
      stripeSessionId: "cs_new",
      status: "awaiting_dns",
      notes: ["Payment received — production handoff queued."],
    });

    expect(preserveDeployHandoffOperatorFields(next, existing)).toEqual({
      ...next,
      customDomain: "joesplumbing.com",
      vercelProjectId: "prj_dedicated",
      status: "live",
      vercelDomainStatus: "already_exists",
      notes: [
        "Operator confirmed DNS / publish — lead marked live.",
        "Upsell/re-purchase checkout cs_new — preserved operator handoff status (live) and domain fields.",
      ],
    });
  });

  it("preserves provisioned status and notes on upsell rebuild", () => {
    const existing = baseHandoff({
      stripeSessionId: "cs_old",
      status: "provisioned",
      vercelDomainStatus: "created",
      notes: ["Vercel domain registered: joes.example."],
    });
    const next = baseHandoff({
      stripeSessionId: "cs_upsell",
      status: "awaiting_dns",
      notes: ["fresh defaults"],
    });

    const preserved = preserveDeployHandoffOperatorFields(next, existing);
    expect(preserved.status).toBe("provisioned");
    expect(preserved.vercelDomainStatus).toBe("created");
    expect(preserved.notes).toEqual([
      "Vercel domain registered: joes.example.",
      "Upsell/re-purchase checkout cs_upsell — preserved operator handoff status (provisioned) and domain fields.",
    ]);
  });

  it("does not preserve awaiting_dns / failed status over next rebuild defaults", () => {
    const existing = baseHandoff({
      stripeSessionId: "cs_old",
      status: "failed",
      notes: ["previous failure"],
    });
    const next = baseHandoff({
      stripeSessionId: "cs_retry",
      status: "awaiting_dns",
      notes: ["fresh"],
    });

    expect(preserveDeployHandoffOperatorFields(next, existing)).toEqual(next);
  });

  it("prefers explicit next customDomain / vercelProjectId over existing", () => {
    const existing = baseHandoff({
      customDomain: "old.example",
      vercelProjectId: "prj_old",
    });
    const next = baseHandoff({
      customDomain: "new.example",
      vercelProjectId: "prj_new",
    });

    expect(preserveDeployHandoffOperatorFields(next, existing)).toEqual(next);
  });

  it("treats whitespace-only next fields as absent so existing wins", () => {
    const existing = baseHandoff({
      customDomain: "kept.example",
      vercelProjectId: "prj_kept",
    });
    const next = baseHandoff({
      customDomain: "   ",
      vercelProjectId: "  ",
    });

    expect(preserveDeployHandoffOperatorFields(next, existing)).toEqual({
      ...next,
      customDomain: "kept.example",
      vercelProjectId: "prj_kept",
    });
  });
});

describe("mergeProvisionOntoFreshHandoff", () => {
  it("keeps concurrent Mark live status and notes while applying provision outputs", () => {
    const fresh = baseHandoff({
      status: "live",
      customDomain: "joesplumbing.com",
      notes: [
        "Payment received — production handoff queued.",
        "Operator confirmed DNS / publish — lead marked live.",
      ],
    });
    const provisioned = baseHandoff({
      status: "provisioned",
      customDomain: "joesplumbing.com",
      vercelDomainStatus: "created",
      notes: [
        "Payment received — production handoff queued.",
        "Vercel domain registered: joesplumbing.com. Await DNS propagation, then mark live.",
      ],
      updatedAt: "2026-07-14T12:00:00.000Z",
    });

    expect(mergeProvisionOntoFreshHandoff(fresh, provisioned)).toEqual({
      ...provisioned,
      status: "live",
      customDomain: "joesplumbing.com",
      vercelDomainStatus: "created",
      notes: [
        "Payment received — production handoff queued.",
        "Operator confirmed DNS / publish — lead marked live.",
        "Vercel domain registered: joesplumbing.com. Await DNS propagation, then mark live.",
      ],
    });
  });

  it("prefers a concurrent customDomain clear from fresh over the stale provision snapshot", () => {
    const fresh = baseHandoff({
      status: "awaiting_dns",
      customDomain: undefined,
      notes: ["Payment received — production handoff queued."],
    });
    const provisioned = baseHandoff({
      status: "provisioned",
      customDomain: "old.example",
      vercelDomainStatus: "created",
      notes: [
        "Payment received — production handoff queued.",
        "Vercel domain registered: old.example. Await DNS propagation, then mark live.",
      ],
    });

    const merged = mergeProvisionOntoFreshHandoff(fresh, provisioned);
    expect(merged.customDomain).toBeUndefined();
    expect(merged.status).toBe("provisioned");
    expect(merged.vercelDomainStatus).toBe("created");
  });

  it("does not keep a stale fresh failed status over a successful provision rebuild", () => {
    const fresh = baseHandoff({
      status: "failed",
      stripeSessionId: "cs_old",
      notes: ["previous failure"],
    });
    const provisioned = baseHandoff({
      status: "provisioned",
      stripeSessionId: "cs_retry",
      vercelDomainStatus: "created",
      notes: [
        "Payment received — production handoff queued.",
        "Vercel domain registered: joes-plumbing.localsitestudio.com. Await DNS propagation, then mark live.",
      ],
    });

    const merged = mergeProvisionOntoFreshHandoff(fresh, provisioned);
    expect(merged.status).toBe("provisioned");
    expect(merged.stripeSessionId).toBe("cs_retry");
    expect(merged.notes).toEqual([
      "previous failure",
      "Payment received — production handoff queued.",
      "Vercel domain registered: joes-plumbing.localsitestudio.com. Await DNS propagation, then mark live.",
    ]);
  });

  it("never downgrades fresh provisioned when provisioned snapshot stayed awaiting_dns", () => {
    const fresh = baseHandoff({ status: "provisioned", vercelDomainStatus: "created" });
    const provisioned = baseHandoff({
      status: "awaiting_dns",
      vercelDomainStatus: "skipped_unconfigured",
      notes: [...fresh.notes, "Skipped Vercel domain API (set VERCEL_TOKEN + VERCEL_PROJECT_ID, or assign a per-client Vercel project, to enable)."],
    });

    const merged = mergeProvisionOntoFreshHandoff(fresh, provisioned);
    expect(merged.status).toBe("provisioned");
    expect(merged.vercelDomainStatus).toBe("skipped_unconfigured");
  });
});
