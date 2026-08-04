import { getOrderRecords, type OrderRecord } from "./orders";
import { toCents, formatCents } from "./payout-reconciliation";

export type ArtistPayoutEventInput = {
  artistAccountId: string;
  artistHandle?: string;
  orderId: string;
  orderDate: string;
  payoutCents: number;
};

export type CohortPeriodMetrics = {
  monthOffset: number; // 0 = M0 (launch month), 1 = M1, 2 = M2, etc.
  retainedArtists: number;
  retentionRatePercent: number;
  payoutCents: number;
};

export type ArtistCohortSummary = {
  cohortMonth: string; // YYYY-MM format of the artist's first payout order
  initialArtistCount: number;
  initialPayoutCents: number;
  periods: Record<number, CohortPeriodMetrics>;
};

export type ArtistRetentionAnalysisReport = {
  generatedAt: string;
  totalUniqueArtists: number;
  totalOrdersAnalyzed: number;
  totalPayoutCentsDistributed: number;
  averageOrdersPerArtist: number;
  repeatPayoutArtistCount: number;
  repeatPayoutArtistPercent: number;
  cohortSummaries: ArtistCohortSummary[];
  overallM1RetentionRatePercent: number;
  overallM3RetentionRatePercent: number;
  healthStatus: "healthy" | "at_risk" | "insufficient_data";
  summaryLabel: string;
};

function getYearMonth(isoDate: string): string {
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) {
    return "1970-01";
  }
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function calculateMonthOffset(startMonthStr: string, targetMonthStr: string): number {
  const [startY, startM] = startMonthStr.split("-").map(Number);
  const [targetY, targetM] = targetMonthStr.split("-").map(Number);

  if (!startY || !startM || !targetY || !targetM) {
    return 0;
  }

  return (targetY - startY) * 12 + (targetM - startM);
}

export function extractArtistPayoutEventsFromOrders(
  orders: OrderRecord[],
): ArtistPayoutEventInput[] {
  const events: ArtistPayoutEventInput[] = [];

  for (const order of orders) {
    if (order.status === "cancelled") {
      continue;
    }

    if (!order.artistAccountId) {
      continue;
    }

    const payoutCents =
      order.artistTransferTotal !== null
        ? toCents(order.artistTransferTotal)
        : 0;

    if (payoutCents <= 0) {
      continue;
    }

    events.push({
      artistAccountId: order.artistAccountId,
      artistHandle: order.artistHandle ?? undefined,
      orderId: order.orderId,
      orderDate: order.recordedAt,
      payoutCents,
    });
  }

  return events;
}

export function analyzeArtistRetentionAndPayoutCohorts(options: {
  orders?: OrderRecord[];
  events?: ArtistPayoutEventInput[];
  now?: string;
} = {}): ArtistRetentionAnalysisReport {
  const now = options.now ?? new Date().toISOString();
  const events =
    options.events ??
    extractArtistPayoutEventsFromOrders(options.orders ?? getOrderRecords());

  if (events.length === 0) {
    return {
      generatedAt: now,
      totalUniqueArtists: 0,
      totalOrdersAnalyzed: 0,
      totalPayoutCentsDistributed: 0,
      averageOrdersPerArtist: 0,
      repeatPayoutArtistCount: 0,
      repeatPayoutArtistPercent: 0,
      cohortSummaries: [],
      overallM1RetentionRatePercent: 0,
      overallM3RetentionRatePercent: 0,
      healthStatus: "insufficient_data",
      summaryLabel: "0 artist payout cohorts analyzed — no qualifying order data available",
    };
  }

  // 1. Map artists to their first order date and all order events
  const artistMap = new Map<
    string,
    {
      firstMonth: string;
      events: ArtistPayoutEventInput[];
    }
  >();

  for (const ev of events) {
    const month = getYearMonth(ev.orderDate);
    let artist = artistMap.get(ev.artistAccountId);
    if (!artist) {
      artist = { firstMonth: month, events: [] };
      artistMap.set(ev.artistAccountId, artist);
    } else {
      if (month < artist.firstMonth) {
        artist.firstMonth = month;
      }
    }
    artist.events.push(ev);
  }

  const totalUniqueArtists = artistMap.size;
  const totalOrdersAnalyzed = events.length;
  const totalPayoutCentsDistributed = events.reduce(
    (sum, e) => sum + e.payoutCents,
    0,
  );
  const averageOrdersPerArtist =
    totalUniqueArtists > 0
      ? Math.round((totalOrdersAnalyzed / totalUniqueArtists) * 10) / 10
      : 0;

  let repeatPayoutArtistCount = 0;
  for (const artist of artistMap.values()) {
    if (artist.events.length > 1) {
      repeatPayoutArtistCount++;
    }
  }

  const repeatPayoutArtistPercent =
    totalUniqueArtists > 0
      ? Math.round((repeatPayoutArtistCount / totalUniqueArtists) * 1000) / 10
      : 0;

  // 2. Build cohort groupings by firstMonth
  const cohortGroups = new Map<
    string,
    {
      artists: Set<string>;
      artistEvents: Map<string, ArtistPayoutEventInput[]>;
    }
  >();

  for (const [artistId, data] of artistMap.entries()) {
    let group = cohortGroups.get(data.firstMonth);
    if (!group) {
      group = { artists: new Set(), artistEvents: new Map() };
      cohortGroups.set(data.firstMonth, group);
    }
    group.artists.add(artistId);
    group.artistEvents.set(artistId, data.events);
  }

  // 3. Process cohort summaries sorted by month
  const sortedCohortMonths = Array.from(cohortGroups.keys()).sort();
  const cohortSummaries: ArtistCohortSummary[] = [];

  let sumM1Numerator = 0;
  let sumM1Denominator = 0;
  let sumM3Numerator = 0;
  let sumM3Denominator = 0;

  for (const cohortMonth of sortedCohortMonths) {
    const group = cohortGroups.get(cohortMonth)!;
    const initialArtistCount = group.artists.size;

    // Track monthly active status and payout amounts per artist per month offset
    const offsetData = new Map<
      number,
      { retainedArtists: Set<string>; payoutCents: number }
    >();

    let initialPayoutCents = 0;

    for (const [artistId, artistEvs] of group.artistEvents.entries()) {
      for (const ev of artistEvs) {
        const evMonth = getYearMonth(ev.orderDate);
        const offset = calculateMonthOffset(cohortMonth, evMonth);

        if (offset < 0) continue;

        if (offset === 0) {
          initialPayoutCents += ev.payoutCents;
        }

        let off = offsetData.get(offset);
        if (!off) {
          off = { retainedArtists: new Set(), payoutCents: 0 };
          offsetData.set(offset, off);
        }
        off.retainedArtists.add(artistId);
        off.payoutCents += ev.payoutCents;
      }
    }

    const periods: Record<number, CohortPeriodMetrics> = {};
    const sortedOffsets = Array.from(offsetData.keys()).sort((a, b) => a - b);

    for (const offset of sortedOffsets) {
      const off = offsetData.get(offset)!;
      const retainedCount = off.retainedArtists.size;
      const retentionRate =
        initialArtistCount > 0
          ? Math.round((retainedCount / initialArtistCount) * 1000) / 10
          : 0;

      periods[offset] = {
        monthOffset: offset,
        retainedArtists: retainedCount,
        retentionRatePercent: retentionRate,
        payoutCents: off.payoutCents,
      };

      if (offset === 1) {
        sumM1Numerator += retainedCount;
        sumM1Denominator += initialArtistCount;
      }
      if (offset === 3) {
        sumM3Numerator += retainedCount;
        sumM3Denominator += initialArtistCount;
      }
    }

    cohortSummaries.push({
      cohortMonth,
      initialArtistCount,
      initialPayoutCents,
      periods,
    });
  }

  const overallM1RetentionRatePercent =
    sumM1Denominator > 0
      ? Math.round((sumM1Numerator / sumM1Denominator) * 1000) / 10
      : 0;

  const overallM3RetentionRatePercent =
    sumM3Denominator > 0
      ? Math.round((sumM3Numerator / sumM3Denominator) * 1000) / 10
      : 0;

  let healthStatus: "healthy" | "at_risk" | "insufficient_data" = "healthy";
  if (totalUniqueArtists < 3) {
    healthStatus = "insufficient_data";
  } else if (repeatPayoutArtistPercent < 25 && sumM1Denominator > 0 && overallM1RetentionRatePercent < 20) {
    healthStatus = "at_risk";
  }

  const summaryLabel =
    healthStatus === "insufficient_data"
      ? `${totalUniqueArtists} unique artist(s) analyzed — baseline building (${formatCents(totalPayoutCentsDistributed)} distributed)`
      : `${repeatPayoutArtistPercent}% repeat payout rate across ${totalUniqueArtists} artists (${cohortSummaries.length} monthly cohort(s), ${formatCents(totalPayoutCentsDistributed)} total payouts)`;

  return {
    generatedAt: now,
    totalUniqueArtists,
    totalOrdersAnalyzed,
    totalPayoutCentsDistributed,
    averageOrdersPerArtist,
    repeatPayoutArtistCount,
    repeatPayoutArtistPercent,
    cohortSummaries,
    overallM1RetentionRatePercent,
    overallM3RetentionRatePercent,
    healthStatus,
    summaryLabel,
  };
}

export const analyzeArtistCohorts = analyzeArtistRetentionAndPayoutCohorts;

