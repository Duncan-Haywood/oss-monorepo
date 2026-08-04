import { AcquisitionChannelId } from "./contribution-margin";

export type CohortWindow = "30d" | "60d" | "90d" | "180d" | "365d";

export type ChannelCohortInput = {
  channelId: AcquisitionChannelId;
  channelName: string;
  initialCustomers: number;
  initialAdSpendUsd: number;
  averageFirstOrderValueUsd: number;
  grossMarginPct: number; // e.g. 0.40 = 40% gross profit margin
  monthlyRepeatOrderRate: number; // e.g. 0.08 = 8% repeat orders per customer per month
};

export type CohortPerformanceMetrics = {
  channelId: AcquisitionChannelId;
  channelName: string;
  initialCustomers: number;
  cacUsd: number;
  ltv30d: number;
  ltv60d: number;
  ltv90d: number;
  ltv180d: number;
  ltv365d: number;
  ltvToCacRatio365d: number;
  paybackPeriodDays: number;
  status: "high_margin_scale" | "healthy" | "payback_warning" | "unprofitable";
  recommendation: string;
};

export type PortfolioCohortSummary = {
  channels: CohortPerformanceMetrics[];
  totalInitialCustomers: number;
  totalInitialSpendUsd: number;
  blendedCacUsd: number;
  blendedLtv365d: number;
  blendedLtvToCacRatio365d: number;
  averagePaybackDays: number;
  topScalingChannel: string;
};

function calculateCumulativeLtv(
  firstOrderVal: number,
  marginPct: number,
  repeatRate: number,
  months: number,
): number {
  let cumulativeProfit = firstOrderVal * marginPct;
  for (let m = 1; m <= months; m++) {
    const monthlyRepeatValue = firstOrderVal * repeatRate * Math.pow(0.92, m - 1);
    cumulativeProfit += monthlyRepeatValue * marginPct;
  }
  return Math.round(cumulativeProfit * 100) / 100;
}

export function calculateChannelCohortRetention(
  input: ChannelCohortInput,
): CohortPerformanceMetrics {
  const {
    channelId,
    channelName,
    initialCustomers,
    initialAdSpendUsd,
    averageFirstOrderValueUsd,
    grossMarginPct,
    monthlyRepeatOrderRate,
  } = input;

  const cacUsd =
    initialCustomers > 0
      ? Math.round((initialAdSpendUsd / initialCustomers) * 100) / 100
      : 0;

  const ltv30d = calculateCumulativeLtv(
    averageFirstOrderValueUsd,
    grossMarginPct,
    monthlyRepeatOrderRate,
    1,
  );
  const ltv60d = calculateCumulativeLtv(
    averageFirstOrderValueUsd,
    grossMarginPct,
    monthlyRepeatOrderRate,
    2,
  );
  const ltv90d = calculateCumulativeLtv(
    averageFirstOrderValueUsd,
    grossMarginPct,
    monthlyRepeatOrderRate,
    3,
  );
  const ltv180d = calculateCumulativeLtv(
    averageFirstOrderValueUsd,
    grossMarginPct,
    monthlyRepeatOrderRate,
    6,
  );
  const ltv365d = calculateCumulativeLtv(
    averageFirstOrderValueUsd,
    grossMarginPct,
    monthlyRepeatOrderRate,
    12,
  );

  const ltvToCacRatio365d =
    cacUsd > 0 ? Math.round((ltv365d / cacUsd) * 100) / 100 : ltv365d > 0 ? 999 : 0;

  // Estimate payback period in days
  let paybackPeriodDays = 999;
  if (cacUsd === 0) {
    paybackPeriodDays = 0;
  } else if (ltv30d >= cacUsd) {
    paybackPeriodDays = Math.round((cacUsd / ltv30d) * 30);
  } else if (ltv90d >= cacUsd) {
    paybackPeriodDays = Math.round(30 + ((cacUsd - ltv30d) / (ltv90d - ltv30d)) * 60);
  } else if (ltv365d >= cacUsd) {
    paybackPeriodDays = Math.round(90 + ((cacUsd - ltv90d) / (ltv365d - ltv90d)) * 275);
  }

  let status: "high_margin_scale" | "healthy" | "payback_warning" | "unprofitable" = "healthy";
  let recommendation = "Channel retention economics are healthy. Maintain investment.";

  if (cacUsd > 0 && ltvToCacRatio365d < 1.0) {
    status = "unprofitable";
    recommendation = `365-day LTV ($${ltv365d}) is less than CAC ($${cacUsd}). Pause spend or optimize first-order conversion margin.`;
  } else if (paybackPeriodDays > 120) {
    status = "payback_warning";
    recommendation = `Payback period (${paybackPeriodDays} days) exceeds 120-day target. Reduce CAC or launch cross-sell repeat campaigns.`;
  } else if (ltvToCacRatio365d >= 2.0 && paybackPeriodDays <= 45) {
    status = "high_margin_scale";
    recommendation = `Exceptional LTV:CAC (${ltvToCacRatio365d}x) and fast payback (${paybackPeriodDays} days). Aggressively increase ad budget.`;
  }

  return {
    channelId,
    channelName,
    initialCustomers,
    cacUsd,
    ltv30d,
    ltv60d,
    ltv90d,
    ltv180d,
    ltv365d,
    ltvToCacRatio365d,
    paybackPeriodDays,
    status,
    recommendation,
  };
}

export function summarizePortfolioCohortRetention(
  inputs: ChannelCohortInput[],
): PortfolioCohortSummary {
  const channels = inputs.map(calculateChannelCohortRetention);

  const totalInitialCustomers = channels.reduce((sum, c) => sum + c.initialCustomers, 0);
  const totalInitialSpendUsd = Math.round(
    inputs.reduce((sum, i) => sum + i.initialAdSpendUsd, 0) * 100,
  ) / 100;

  const blendedCacUsd =
    totalInitialCustomers > 0
      ? Math.round((totalInitialSpendUsd / totalInitialCustomers) * 100) / 100
      : 0;

  const weightedLtv365 =
    totalInitialCustomers > 0
      ? channels.reduce((sum, c) => sum + c.ltv365d * c.initialCustomers, 0) /
        totalInitialCustomers
      : 0;

  const blendedLtv365d = Math.round(weightedLtv365 * 100) / 100;

  const blendedLtvToCacRatio365d =
    blendedCacUsd > 0
      ? Math.round((blendedLtv365d / blendedCacUsd) * 100) / 100
      : blendedLtv365d > 0
      ? 999
      : 0;

  const validPaybacks = channels.filter((c) => c.paybackPeriodDays < 999);
  const averagePaybackDays =
    validPaybacks.length > 0
      ? Math.round(
          validPaybacks.reduce((sum, c) => sum + c.paybackPeriodDays, 0) /
            validPaybacks.length,
        )
      : 0;

  const sortedByLtvToCac = [...channels].sort(
    (a, b) => b.ltvToCacRatio365d - a.ltvToCacRatio365d,
  );
  const topScalingChannel = sortedByLtvToCac[0]?.channelName ?? "None";

  return {
    channels,
    totalInitialCustomers,
    totalInitialSpendUsd,
    blendedCacUsd,
    blendedLtv365d,
    blendedLtvToCacRatio365d,
    averagePaybackDays,
    topScalingChannel,
  };
}
