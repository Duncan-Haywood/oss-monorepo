import { formatCents } from "@/lib/payout-reconciliation";

export type CustomerOrder = {
  orderId: string;
  customerEmail: string;
  orderDate: string; // ISO string e.g. "2026-06-15T10:00:00Z"
  totalPaidCents: number;
  artistAccountId?: string;
  artworkSlug?: string;
};

export type CustomerCohortPeriod = {
  monthOffset: number; // 0, 1, 2...
  activeCustomers: number;
  retentionRatePercent: number;
  revenueCents: number;
};

export type CustomerCohortSummary = {
  cohortMonth: string; // e.g. "2026-06"
  initialCustomerCount: number;
  initialRevenueCents: number;
  averageInitialOrderCents: number;
  totalCumulativeRevenueCents: number;
  averageLtvCents: number;
  repeatCustomerCount: number;
  repeatCustomerPercent: number;
  periods: Record<number, CustomerCohortPeriod>;
};

export type ReengagementCandidate = {
  customerEmail: string;
  firstOrderDate: string;
  lastOrderDate: string;
  totalOrders: number;
  totalSpendCents: number;
  daysSinceLastOrder: number;
  preferredArtworkSlug?: string;
  recommendedCampaign: string;
};

export type CustomerCohortAnalyticsReport = {
  totalUniqueCustomers: number;
  totalOrdersAnalyzed: number;
  totalRevenueCents: number;
  repeatCustomerCount: number;
  repeatCustomerPercent: number;
  overallAverageLtvCents: number;
  summaryLabel: string;
  cohortSummaries: CustomerCohortSummary[];
  reengagementCandidates: ReengagementCandidate[];
};

export const sampleCustomerOrders: CustomerOrder[] = [
  { orderId: "ord_101", customerEmail: "alice@example.com", orderDate: "2026-04-10T12:00:00Z", totalPaidCents: 12000, artworkSlug: "midnight-coast" },
  { orderId: "ord_102", customerEmail: "bob@example.com", orderDate: "2026-04-14T15:30:00Z", totalPaidCents: 8500, artworkSlug: "urban-geometry" },
  { orderId: "ord_103", customerEmail: "alice@example.com", orderDate: "2026-05-20T11:00:00Z", totalPaidCents: 15000, artworkSlug: "spring-bloom" },
  { orderId: "ord_104", customerEmail: "carol@example.com", orderDate: "2026-05-25T09:15:00Z", totalPaidCents: 9500, artworkSlug: "midnight-coast" },
  { orderId: "ord_105", customerEmail: "bob@example.com", orderDate: "2026-06-05T14:20:00Z", totalPaidCents: 12000, artworkSlug: "urban-geometry" },
  { orderId: "ord_106", customerEmail: "dave@example.com", orderDate: "2026-06-18T16:45:00Z", totalPaidCents: 11000, artworkSlug: "neon-reflections" },
  { orderId: "ord_107", customerEmail: "alice@example.com", orderDate: "2026-06-28T18:00:00Z", totalPaidCents: 14000, artworkSlug: "coastal-fog" },
  { orderId: "ord_108", customerEmail: "eve@example.com", orderDate: "2026-07-02T10:10:00Z", totalPaidCents: 9000, artworkSlug: "spring-bloom" },
  { orderId: "ord_109", customerEmail: "carol@example.com", orderDate: "2026-07-15T13:30:00Z", totalPaidCents: 13000, artworkSlug: "midnight-coast" },
  { orderId: "ord_110", customerEmail: "frank@example.com", orderDate: "2026-07-22T08:50:00Z", totalPaidCents: 10500, artworkSlug: "urban-geometry" },
];

export function analyzeCustomerRetentionAndCohorts(
  orders: CustomerOrder[] = sampleCustomerOrders,
  nowIso: string = "2026-08-01T00:00:00.000Z",
): CustomerCohortAnalyticsReport {
  const nowMs = new Date(nowIso).getTime();

  // Group orders by customer email
  type CustomerAggregate = {
    email: string;
    orders: CustomerOrder[];
    firstOrderDate: string;
    lastOrderDate: string;
    totalSpendCents: number;
  };
  const customerMap = new Map<string, CustomerAggregate>();

  for (const order of orders) {
    const existing = customerMap.get(order.customerEmail);
    if (!existing) {
      customerMap.set(order.customerEmail, {
        email: order.customerEmail,
        orders: [order],
        firstOrderDate: order.orderDate,
        lastOrderDate: order.orderDate,
        totalSpendCents: order.totalPaidCents,
      });
    } else {
      existing.orders.push(order);
      existing.totalSpendCents += order.totalPaidCents;
      if (new Date(order.orderDate) < new Date(existing.firstOrderDate)) {
        existing.firstOrderDate = order.orderDate;
      }
      if (new Date(order.orderDate) > new Date(existing.lastOrderDate)) {
        existing.lastOrderDate = order.orderDate;
      }
    }
  }

  const totalUniqueCustomers = customerMap.size;
  const totalOrdersAnalyzed = orders.length;

  let totalRevenueCents = 0;
  let repeatCustomerCount = 0;

  for (const customer of customerMap.values()) {
    totalRevenueCents += customer.totalSpendCents;
    if (customer.orders.length > 1) {
      repeatCustomerCount++;
    }
  }

  const repeatCustomerPercent =
    totalUniqueCustomers > 0 ? Math.round((repeatCustomerCount / totalUniqueCustomers) * 100) : 0;

  const overallAverageLtvCents =
    totalUniqueCustomers > 0 ? Math.round(totalRevenueCents / totalUniqueCustomers) : 0;

  // Build monthly cohorts by customer first-order month
  const cohortGroups = new Map<string, CustomerAggregate[]>();

  for (const customer of customerMap.values()) {
    const cohortMonth = customer.firstOrderDate.substring(0, 7); // "YYYY-MM"
    if (!cohortGroups.has(cohortMonth)) {
      cohortGroups.set(cohortMonth, []);
    }
    cohortGroups.get(cohortMonth)!.push(customer);
  }

  const sortedCohortMonths = Array.from(cohortGroups.keys()).sort();

  const cohortSummaries: CustomerCohortSummary[] = sortedCohortMonths.map((cohortMonth) => {
    const customers = cohortGroups.get(cohortMonth)!;
    const initialCustomerCount = customers.length;

    let initialRevenueCents = 0;
    let totalCumulativeRevenueCents = 0;
    let repeatCount = 0;

    const periodMap = new Map<number, { active: Set<string>; revenue: number }>();

    const [cYear, cMonth] = cohortMonth.split("-").map(Number);
    const cohortStartMs = Date.UTC(cYear, cMonth - 1, 1);

    for (const customer of customers) {
      if (customer.orders.length > 1) {
        repeatCount++;
      }

      for (const ord of customer.orders) {
        totalCumulativeRevenueCents += ord.totalPaidCents;
        const ordDate = new Date(ord.orderDate);
        const ordYear = ordDate.getUTCFullYear();
        const ordMonth = ordDate.getUTCMonth();

        const monthOffset = (ordYear - cYear) * 12 + (ordMonth - (cMonth - 1));

        if (monthOffset === 0) {
          initialRevenueCents += ord.totalPaidCents;
        }

        if (!periodMap.has(monthOffset)) {
          periodMap.set(monthOffset, { active: new Set(), revenue: 0 });
        }
        const p = periodMap.get(monthOffset)!;
        p.active.add(customer.email);
        p.revenue += ord.totalPaidCents;
      }
    }

    const periods: Record<number, CustomerCohortPeriod> = {};
    const sortedOffsets = Array.from(periodMap.keys()).sort((a, b) => a - b);

    for (const offset of sortedOffsets) {
      const p = periodMap.get(offset)!;
      periods[offset] = {
        monthOffset: offset,
        activeCustomers: p.active.size,
        retentionRatePercent: Math.round((p.active.size / initialCustomerCount) * 100),
        revenueCents: p.revenue,
      };
    }

    return {
      cohortMonth,
      initialCustomerCount,
      initialRevenueCents,
      averageInitialOrderCents: Math.round(initialRevenueCents / initialCustomerCount),
      totalCumulativeRevenueCents,
      averageLtvCents: Math.round(totalCumulativeRevenueCents / initialCustomerCount),
      repeatCustomerCount: repeatCount,
      repeatCustomerPercent: Math.round((repeatCount / initialCustomerCount) * 100),
      periods,
    };
  });

  // Re-engagement candidates: single-purchase or inactive (>30 days) customers
  const reengagementCandidates: ReengagementCandidate[] = [];

  for (const customer of customerMap.values()) {
    const lastOrderMs = new Date(customer.lastOrderDate).getTime();
    const daysSinceLastOrder = Math.floor((nowMs - lastOrderMs) / (1000 * 60 * 60 * 24));

    if (daysSinceLastOrder >= 21) {
      // Find preferred artwork slug
      const slugCounts = new Map<string, number>();
      for (const ord of customer.orders) {
        if (ord.artworkSlug) {
          slugCounts.set(ord.artworkSlug, (slugCounts.get(ord.artworkSlug) ?? 0) + 1);
        }
      }

      let preferredArtworkSlug: string | undefined;
      let maxCount = 0;
      for (const [slug, count] of slugCounts.entries()) {
        if (count > maxCount) {
          maxCount = count;
          preferredArtworkSlug = slug;
        }
      }

      let recommendedCampaign = "Winback Discount & New Catalog Showcase";
      if (customer.orders.length > 1) {
        recommendedCampaign = "VIP Repeat Loyalty Reward & Early Access";
      } else if (daysSinceLastOrder > 60) {
        recommendedCampaign = "Lapsed Buyer Re-Engagement Offer (15% Off)";
      }

      reengagementCandidates.push({
        customerEmail: customer.email,
        firstOrderDate: customer.firstOrderDate,
        lastOrderDate: customer.lastOrderDate,
        totalOrders: customer.orders.length,
        totalSpendCents: customer.totalSpendCents,
        daysSinceLastOrder,
        preferredArtworkSlug,
        recommendedCampaign,
      });
    }
  }

  reengagementCandidates.sort((a, b) => b.totalSpendCents - a.totalSpendCents);

  const summaryLabel = `${totalUniqueCustomers} unique buyer(s) analyzed across ${cohortSummaries.length} cohort month(s) — ${repeatCustomerPercent}% repeat purchase rate, average LTV ${formatCents(
    overallAverageLtvCents,
  )}`;

  return {
    totalUniqueCustomers,
    totalOrdersAnalyzed,
    totalRevenueCents,
    repeatCustomerCount,
    repeatCustomerPercent,
    overallAverageLtvCents,
    summaryLabel,
    cohortSummaries,
    reengagementCandidates,
  };
}

export function generateConvexCustomerCohortSchema() {
  const schemaCode = `
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  customer_cohort_snapshots: defineTable({
    snapshotId: v.string(),
    timestamp: v.string(),
    totalUniqueCustomers: v.number(),
    totalOrdersAnalyzed: v.number(),
    totalRevenueCents: v.number(),
    repeatCustomerCount: v.number(),
    repeatCustomerPercent: v.number(),
    overallAverageLtvCents: v.number(),
    cohortsCount: v.number(),
    reengagementCandidatesCount: v.number(),
    convexSyncedAt: v.string(),
  })
    .index("by_snapshotId", ["snapshotId"])
    .index("by_timestamp", ["timestamp"]),
});
`;
  return {
    tableName: "customer_cohort_snapshots",
    indexes: ["by_snapshotId", "by_timestamp"],
    schemaCode: schemaCode.trim(),
  };
}
