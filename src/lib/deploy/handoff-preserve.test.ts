import { describe, expect, it } from "vitest";
import { preserveDeployHandoffOperatorFields } from "./handoff-preserve";
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
      status: "live",
    });
    const next = baseHandoff({ stripeSessionId: "cs_new" });

    expect(preserveDeployHandoffOperatorFields(next, existing)).toEqual({
      ...next,
      customDomain: "joesplumbing.com",
      vercelProjectId: "prj_dedicated",
    });
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
