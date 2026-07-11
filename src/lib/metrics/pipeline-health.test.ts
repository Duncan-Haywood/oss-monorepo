import { describe, expect, it } from "vitest";
import { computePipelineHealth, emptyStageCounts, formatUsd } from "./pipeline-health";
import type { Lead, LeadPipelineStage } from "../leads/types";
import type { DeployHandoff } from "../deploy/types";
import type { ClientInquiry } from "../inquiries/types";
import type { OrderRecord } from "../orders/types";

function makeLead(stage: LeadPipelineStage, overrides: Partial<Lead> = {}): Lead {
  return {
    slug: `lead-${stage}-${Math.random().toString(36).slice(2, 8)}`,
    businessName: "Test Co",
    category: "generic",
    city: "Denver",
    state: "CO",
    tagline: "t",
    description: "d",
    phone: "(555) 000-0000",
    email: "owner@example.com",
    services: [],
    hours: { weekday: "Mon-Fri", weekend: "Sat" },
    stage,
    recommendedTier: "starter",
    ...overrides,
  };
}

function makeHandoff(status: DeployHandoff["status"]): DeployHandoff {
  return {
    id: "h1",
    leadSlug: "lead-1",
    businessName: "Test Co",
    tier: "starter",
    commerceAddon: false,
    stripeSessionId: "sess_1",
    customerEmail: "owner@example.com",
    previewUrl: "/preview/lead-1",
    suggestedHost: "lead-1.example.com",
    contactFormUrl: "/api/contact/lead-1",
    dnsInstructions: [],
    status,
    notes: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeInquiry(status: ClientInquiry["status"]): ClientInquiry {
  return {
    id: "inq_1",
    leadSlug: "lead-1",
    businessName: "Test Co",
    message: "Hi",
    status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeOrder(amountPaid: number): OrderRecord {
  return {
    id: "order_1",
    leadSlug: "lead-1",
    stripeSessionId: "sess_1",
    tier: "starter",
    commerceAddon: false,
    amountPaid,
    status: "paid",
    createdAt: new Date().toISOString(),
  };
}

describe("computePipelineHealth", () => {
  it("returns all-zero health for empty input", () => {
    const health = computePipelineHealth({ leads: [], orders: [], handoffs: [], inquiries: [] });
    expect(health.revenueTotalUsd).toBe(0);
    expect(health.leadCount).toBe(0);
    expect(health.orderCount).toBe(0);
    expect(health.stageCounts).toEqual(emptyStageCounts());
    expect(health.stageFunnel.map((s) => s.stage)).toEqual([
      "discovered",
      "site_built",
      "outreach_sent",
      "discovery_call",
      "paid",
      "live",
    ]);
  });

  it("sums order revenue and ignores non-finite amounts", () => {
    const health = computePipelineHealth({
      leads: [],
      orders: [makeOrder(500), makeOrder(250), { ...makeOrder(NaN) }],
      handoffs: [],
      inquiries: [],
    });
    expect(health.revenueTotalUsd).toBe(750);
    expect(health.orderCount).toBe(3);
  });

  it("counts leads per stage", () => {
    const health = computePipelineHealth({
      leads: [makeLead("discovered"), makeLead("discovered"), makeLead("paid")],
      orders: [],
      handoffs: [],
      inquiries: [],
    });
    expect(health.stageCounts.discovered).toBe(2);
    expect(health.stageCounts.paid).toBe(1);
    expect(health.leadCount).toBe(3);
  });

  it("flags leads missing email only in revenue-critical stages", () => {
    const health = computePipelineHealth({
      leads: [
        makeLead("outreach_sent", { email: undefined, slug: "no-email-critical" }),
        makeLead("discovered", { email: undefined, slug: "no-email-not-critical" }),
        makeLead("paid", { email: "has@example.com", slug: "has-email" }),
      ],
      orders: [],
      handoffs: [],
      inquiries: [],
    });
    expect(health.leadsMissingEmailCount).toBe(1);
    expect(health.leadsMissingEmail.map((l) => l.slug)).toEqual(["no-email-critical"]);
  });

  it("counts open handoffs (non-live) and new inquiries", () => {
    const health = computePipelineHealth({
      leads: [],
      orders: [],
      handoffs: [makeHandoff("pending"), makeHandoff("awaiting_dns"), makeHandoff("live")],
      inquiries: [makeInquiry("new"), makeInquiry("read"), makeInquiry("new")],
    });
    expect(health.openHandoffCount).toBe(2);
    expect(health.newInquiryCount).toBe(2);
  });

  it("counts paid-not-live leads as those still in the paid stage", () => {
    const health = computePipelineHealth({
      leads: [makeLead("paid"), makeLead("paid"), makeLead("live")],
      orders: [],
      handoffs: [],
      inquiries: [],
    });
    expect(health.paidNotLiveCount).toBe(2);
  });
});

describe("formatUsd", () => {
  it("formats whole dollars without decimals", () => {
    expect(formatUsd(500)).toBe("$500");
  });

  it("formats fractional dollars with cents", () => {
    expect(formatUsd(499.5)).toBe("$499.50");
  });
});
