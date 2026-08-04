/**
 * Customer Repeat Order Rate & Print Collection Affinity Engine
 * 
 * Analyzes customer cross-collection buying patterns, computes repeat order velocity,
 * identifies primary art collection affinities, and builds cross-sell recommendations
 * to drive LTV and customer retention for Print Atelier.
 */

export interface OrderHistoryItem {
  orderId: string;
  customerId: string;
  artworkId: string;
  collectionId: string;
  collectionName: string;
  purchasePriceCents: number;
  purchasedAt: string; // ISO 8601 string
}

export interface CollectionShare {
  collectionId: string;
  collectionName: string;
  itemCount: number;
  spendCents: number;
  sharePercent: number;
}

export interface CustomerAffinityProfile {
  customerId: string;
  totalOrders: number;
  repeatOrderCount: number;
  repeatOrderRatePercent: number;
  totalSpentCents: number;
  averageOrderValueCents: number;
  averageDaysBetweenOrders: number;
  topCollectionAffinity?: CollectionShare;
  collectionBreakdown: CollectionShare[];
  recommendedCollectionIds: string[];
}

export interface CoOccurrencePair {
  collectionIdA: string;
  collectionIdB: string;
  coOrderCount: number;
  affinityStrengthScore: number; // 0.0 to 1.0
}

export interface RepeatOrderMetricsSummary {
  totalUniqueCustomers: number;
  repeatCustomerCount: number;
  repeatCustomerRatePercent: number;
  averageCustomerLtvCents: number;
  overallAverageDaysBetweenOrders: number;
  mostPopularCollection: string;
}

/**
 * Calculates collection affinity metrics and repeat purchase statistics for a single customer.
 */
export function calculateCustomerCollectionAffinity(
  customerId: string,
  orders: OrderHistoryItem[]
): CustomerAffinityProfile {
  const customerOrders = orders.filter((o) => o.customerId === customerId);

  if (customerOrders.length === 0) {
    return {
      customerId,
      totalOrders: 0,
      repeatOrderCount: 0,
      repeatOrderRatePercent: 0,
      totalSpentCents: 0,
      averageOrderValueCents: 0,
      averageDaysBetweenOrders: 0,
      collectionBreakdown: [],
      recommendedCollectionIds: [],
    };
  }

  // Deduplicate orders by orderId to count distinct orders
  const uniqueOrderIds = new Set(customerOrders.map((o) => o.orderId));
  const totalOrders = uniqueOrderIds.size;
  const repeatOrderCount = Math.max(0, totalOrders - 1);
  const repeatOrderRatePercent = totalOrders > 0 ? Math.round((repeatOrderCount / totalOrders) * 10000) / 100 : 0;

  const totalSpentCents = customerOrders.reduce((sum, o) => sum + o.purchasePriceCents, 0);
  const averageOrderValueCents = totalOrders > 0 ? Math.round(totalSpentCents / totalOrders) : 0;

  // Calculate average days between orders
  const sortedDates = customerOrders
    .map((o) => new Date(o.purchasedAt).getTime())
    .sort((a, b) => a - b);

  let averageDaysBetweenOrders = 0;
  if (sortedDates.length > 1) {
    let totalGapDays = 0;
    for (let i = 1; i < sortedDates.length; i++) {
      const diffMs = sortedDates[i] - sortedDates[i - 1];
      totalGapDays += diffMs / (1000 * 60 * 60 * 24);
    }
    averageDaysBetweenOrders = Math.round((totalGapDays / (sortedDates.length - 1)) * 10) / 10;
  }

  // Calculate collection shares
  const collectionStats = new Map<string, { name: string; count: number; spend: number }>();
  for (const item of customerOrders) {
    const existing = collectionStats.get(item.collectionId) || { name: item.collectionName, count: 0, spend: 0 };
    existing.count += 1;
    existing.spend += item.purchasePriceCents;
    collectionStats.set(item.collectionId, existing);
  }

  const collectionBreakdown: CollectionShare[] = Array.from(collectionStats.entries())
    .map(([colId, stats]) => ({
      collectionId: colId,
      collectionName: stats.name,
      itemCount: stats.count,
      spendCents: stats.spend,
      sharePercent: totalSpentCents > 0 ? Math.round((stats.spend / totalSpentCents) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.spendCents - a.spendCents);

  const topCollectionAffinity = collectionBreakdown.length > 0 ? collectionBreakdown[0] : undefined;

  return {
    customerId,
    totalOrders,
    repeatOrderCount,
    repeatOrderRatePercent,
    totalSpentCents,
    averageOrderValueCents,
    averageDaysBetweenOrders,
    topCollectionAffinity,
    collectionBreakdown,
    recommendedCollectionIds: [],
  };
}

/**
 * Analyzes collection co-purchasing patterns across customer orders.
 */
export function analyzeCollectionCoOccurrence(allOrders: OrderHistoryItem[]): CoOccurrencePair[] {
  // Group orders by customerId
  const customerOrdersMap = new Map<string, Set<string>>();
  for (const order of allOrders) {
    if (!customerOrdersMap.has(order.customerId)) {
      customerOrdersMap.set(order.customerId, new Set());
    }
    customerOrdersMap.get(order.customerId)!.add(order.collectionId);
  }

  const pairCounts = new Map<string, number>();

  for (const collectionsSet of customerOrdersMap.values()) {
    const collectionList = Array.from(collectionsSet).sort();
    for (let i = 0; i < collectionList.length; i++) {
      for (let j = i + 1; j < collectionList.length; j++) {
        const key = `${collectionList[i]}|||${collectionList[j]}`;
        pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
      }
    }
  }

  const totalCustomers = customerOrdersMap.size;

  const results: CoOccurrencePair[] = [];
  for (const [key, count] of pairCounts.entries()) {
    const [colA, colB] = key.split("|||");
    const affinityStrengthScore = totalCustomers > 0 ? Math.round((count / totalCustomers) * 100) / 100 : 0;
    results.push({
      collectionIdA: colA,
      collectionIdB: colB,
      coOrderCount: count,
      affinityStrengthScore,
    });
  }

  return results.sort((a, b) => b.coOrderCount - a.coOrderCount);
}

/**
 * Aggregates overall platform repeat order retention metrics.
 */
export function summarizeRepeatOrderMetrics(allOrders: OrderHistoryItem[]): RepeatOrderMetricsSummary {
  const customerIds = Array.from(new Set(allOrders.map((o) => o.customerId)));
  if (customerIds.length === 0) {
    return {
      totalUniqueCustomers: 0,
      repeatCustomerCount: 0,
      repeatCustomerRatePercent: 0,
      averageCustomerLtvCents: 0,
      overallAverageDaysBetweenOrders: 0,
      mostPopularCollection: "N/A",
    };
  }

  let repeatCustomerCount = 0;
  let totalLtvCents = 0;
  let gapDaysSum = 0;
  let gapDaysCount = 0;

  const collectionTotals = new Map<string, number>();

  for (const customerId of customerIds) {
    const profile = calculateCustomerCollectionAffinity(customerId, allOrders);
    if (profile.totalOrders > 1) {
      repeatCustomerCount++;
    }
    totalLtvCents += profile.totalSpentCents;
    if (profile.averageDaysBetweenOrders > 0) {
      gapDaysSum += profile.averageDaysBetweenOrders;
      gapDaysCount++;
    }
  }

  for (const order of allOrders) {
    collectionTotals.set(
      order.collectionName,
      (collectionTotals.get(order.collectionName) || 0) + order.purchasePriceCents
    );
  }

  let mostPopularCollection = "N/A";
  let maxSpend = -1;
  for (const [colName, spend] of collectionTotals.entries()) {
    if (spend > maxSpend) {
      maxSpend = spend;
      mostPopularCollection = colName;
    }
  }

  const repeatCustomerRatePercent = Math.round((repeatCustomerCount / customerIds.length) * 10000) / 100;
  const averageCustomerLtvCents = Math.round(totalLtvCents / customerIds.length);
  const overallAverageDaysBetweenOrders =
    gapDaysCount > 0 ? Math.round((gapDaysSum / gapDaysCount) * 10) / 10 : 0;

  return {
    totalUniqueCustomers: customerIds.length,
    repeatCustomerCount,
    repeatCustomerRatePercent,
    averageCustomerLtvCents,
    overallAverageDaysBetweenOrders,
    mostPopularCollection,
  };
}

/**
 * Generates Convex schema definition for customer_collection_affinities
 */
export function generateConvexCollectionAffinitySchema(): string {
  return `
export const customer_collection_affinities = defineTable({
  customerId: v.string(),
  totalOrders: v.number(),
  repeatOrderCount: v.number(),
  repeatOrderRatePercent: v.number(),
  totalSpentCents: v.number(),
  averageOrderValueCents: v.number(),
  topCollectionId: v.optional(v.string()),
  topCollectionSharePercent: v.optional(v.number()),
  updatedAt: v.string(),
}).index("by_customer", ["customerId"])
  .index("by_repeat_rate", ["repeatOrderRatePercent"]);
`.trim();
}

class CollectionAffinityStore {
  private profiles: Map<string, CustomerAffinityProfile> = new Map();

  public saveProfile(profile: CustomerAffinityProfile): void {
    this.profiles.set(profile.customerId, profile);
  }

  public getProfile(customerId: string): CustomerAffinityProfile | undefined {
    return this.profiles.get(customerId);
  }

  public clear(): void {
    this.profiles.clear();
  }
}

export const collectionAffinityStore = new CollectionAffinityStore();
