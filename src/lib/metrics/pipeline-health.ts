/**
 * Operator pipeline health — aggregate signals so stuck money and funnel
 * gaps are visible without scanning every lead row.
 * See /docs/process (pipeline-health-metrics).
 */

import type { Lead, LeadPipelineStage } from "@/lib/leads/types";
import type { DeployHandoff } from "@/lib/deploy/types";
import type { ClientInquiry } from "@/lib/inquiries/types";
import type { OrderRecord } from "@/lib/orders/types";

export interface StageCount {
  stage: LeadPipelineStage;
  label: string;
  count: number;
}

export interface MissingEmailLead {
  slug: string;
  businessName: string;
  stage: LeadPipelineStage;
}

export interface PipelineHealth {
  /** Sum of paid order amounts (USD dollars, as stored by the webhook). */
  revenueTotalUsd: number;
  orderCount: number;
  leadCount: number;
  stageCounts: Record<LeadPipelineStage, number>;
  /** Ordered for display (funnel top → bottom). */
  stageFunnel: StageCount[];
  openHandoffCount: number;
  /** Paid / discovery_call / outreach leads with no email — cannot convert or follow up. */
  leadsMissingEmailCount: number;
  leadsMissingEmail: MissingEmailLead[];
  newInquiryCount: number;
  /** Paid but not yet live — fulfillment debt. */
  paidNotLiveCount: number;
}

const STAGE_LABELS: Record<LeadPipelineStage, string> = {
  discovered: "Discovered",
  site_built: "Site built",
  outreach_sent: "Outreach sent",
  discovery_call: "Discovery call",
  paid: "Paid",
  live: "Live",
};

const FUNNEL_ORDER: LeadPipelineStage[] = [
  "discovered",
  "site_built",
  "outreach_sent",
  "discovery_call",
  "paid",
  "live",
];

/** Stages where missing email blocks revenue motion. */
const EMAIL_CRITICAL_STAGES: ReadonlySet<LeadPipelineStage> = new Set([
  "site_built",
  "outreach_sent",
  "discovery_call",
  "paid",
]);

export function emptyStageCounts(): Record<LeadPipelineStage, number> {
  return {
    discovered: 0,
    site_built: 0,
    outreach_sent: 0,
    discovery_call: 0,
    paid: 0,
    live: 0,
  };
}

/**
 * Pure aggregation — safe to call from server pages or client components.
 * Pass whatever the operator dashboard already loaded; no extra DB round-trips.
 */
export function computePipelineHealth(input: {
  leads: Lead[];
  orders: OrderRecord[];
  handoffs: DeployHandoff[];
  inquiries: ClientInquiry[];
}): PipelineHealth {
  const stageCounts = emptyStageCounts();
  for (const lead of input.leads) {
    if (lead.stage in stageCounts) {
      stageCounts[lead.stage] += 1;
    }
  }

  const stageFunnel: StageCount[] = FUNNEL_ORDER.map((stage) => ({
    stage,
    label: STAGE_LABELS[stage],
    count: stageCounts[stage],
  }));

  let revenueTotalUsd = 0;
  for (const order of input.orders) {
    if (typeof order.amountPaid === "number" && Number.isFinite(order.amountPaid)) {
      revenueTotalUsd += order.amountPaid;
    }
  }

  const leadsMissingEmail: MissingEmailLead[] = input.leads
    .filter(
      (lead) =>
        EMAIL_CRITICAL_STAGES.has(lead.stage) &&
        !(lead.email && lead.email.trim().length > 0),
    )
    .map((lead) => ({
      slug: lead.slug,
      businessName: lead.businessName,
      stage: lead.stage,
    }))
    .slice(0, 8);

  const openHandoffCount = input.handoffs.filter((h) => h.status !== "live").length;
  const newInquiryCount = input.inquiries.filter((inq) => inq.status === "new").length;
  const paidNotLiveCount = input.leads.filter((l) => l.stage === "paid").length;

  return {
    revenueTotalUsd,
    orderCount: input.orders.length,
    leadCount: input.leads.length,
    stageCounts,
    stageFunnel,
    openHandoffCount,
    leadsMissingEmailCount: input.leads.filter(
      (lead) =>
        EMAIL_CRITICAL_STAGES.has(lead.stage) &&
        !(lead.email && lead.email.trim().length > 0),
    ).length,
    leadsMissingEmail,
    newInquiryCount,
    paidNotLiveCount,
  };
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}
