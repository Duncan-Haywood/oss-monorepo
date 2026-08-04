import { ChannelSpendAllocation } from "./marketplace";

export type ChannelBudgetItem = {
  channel: string;
  targetBudget: number;
  actualSpend: number;
  cac: number;
  ordersCount: number;
  netContribution: number;
  roomPreviewLift: number; // percentage lift from room preview (e.g. 15 for +15%)
  status: "active" | "held" | "scaled";
};

export type WeeklyChannelBudgetPlan = {
  planId: string;
  weekStarting: string; // ISO date string
  items: ChannelBudgetItem[];
  totalBudget: number;
  totalActualSpend: number;
  blendedCac: number;
  projectedProfitLift: number;
};

export type BudgetExceptionItem = {
  channel: string;
  reason: "negative_contribution" | "cac_too_high" | "low_ltv_cac";
  currentCac: number;
  actualSpend: number;
  netContribution: number;
  recommendedAction: string;
};

export type BudgetExceptionQueue = {
  exceptions: BudgetExceptionItem[];
  totalHeldCapital: number;
  summaryMessage: string;
};

const STORAGE_KEY = "print-atelier-weekly-channel-budget-plans";

let inMemoryBudgetPlans: WeeklyChannelBudgetPlan[] = [];

export function generateBudgetPlanId(weekStarting: string): string {
  return `plan_${weekStarting}_${Math.random().toString(36).slice(2, 7)}`;
}

export function parseWeeklyChannelBudgetPlans(raw: string | null): WeeklyChannelBudgetPlan[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) => typeof item === "object" && item !== null && typeof item.planId === "string",
    );
  } catch {
    return [];
  }
}

export function serializeWeeklyChannelBudgetPlans(plans: WeeklyChannelBudgetPlan[]): string {
  return JSON.stringify(plans);
}

export function getWeeklyChannelBudgetPlans(): WeeklyChannelBudgetPlan[] {
  let plans = inMemoryBudgetPlans;
  if (typeof window !== "undefined") {
    plans = parseWeeklyChannelBudgetPlans(window.localStorage.getItem(STORAGE_KEY));
  }
  return plans;
}

export function recordWeeklyChannelBudgetPlan(
  plan: WeeklyChannelBudgetPlan,
): WeeklyChannelBudgetPlan[] {
  let plans = getWeeklyChannelBudgetPlans();
  plans = [plan, ...plans.filter((p) => p.planId !== plan.planId)].slice(0, 52);

  inMemoryBudgetPlans = plans;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, serializeWeeklyChannelBudgetPlans(plans));
  }
  return plans;
}

export function clearWeeklyChannelBudgetPlans(): void {
  inMemoryBudgetPlans = [];
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

/**
 * The two element shapes `createWeeklyChannelBudgetPlan` reads out of a
 * `ChannelSpendAllocation`: its `plans` entries carry `channel`/`allocatedBudget`/
 * `baselineCap`, its `allocations` entries carry `id`/`weeklyBudgetCap`. Every
 * field is optional here because the function probes for whichever is present.
 * This replaces an `any` on both the container and the element, which meant a
 * typo in any of these six names would have read `undefined` silently.
 */
type BudgetPlanSource = {
  channel?: string;
  id?: string;
  allocatedBudget?: number;
  recommendedWeeklyBudget?: number;
  baselineCap?: number;
  weeklyBudgetCap?: number;
};

export function createWeeklyChannelBudgetPlan(
  weekStarting: string,
  spendAllocation: ChannelSpendAllocation,
  actualMetrics: Record<string, { spend: number; orders: number; roomPreviewLift?: number }>,
): WeeklyChannelBudgetPlan {
  const source = spendAllocation as
    | { plans?: BudgetPlanSource[]; allocations?: BudgetPlanSource[] }
    | undefined;
  const rawPlans: BudgetPlanSource[] = source?.plans ?? source?.allocations ?? [];
  const items: ChannelBudgetItem[] = rawPlans.map((p) => {
    // An entry carrying neither name previously produced `channel: undefined` on
    // the item and indexed `actualMetrics` with it. `""` keeps that entry visibly
    // unnamed and unmatched rather than typed as a string it is not.
    const channelId = p.channel ?? p.id ?? "";
    const targetBudget = p.allocatedBudget ?? p.recommendedWeeklyBudget ?? 0;
    const baselineCap = p.baselineCap ?? p.weeklyBudgetCap ?? 0;
    const metrics = actualMetrics[channelId] ?? { spend: 0, orders: 0, roomPreviewLift: 0 };
    const actualSpend = metrics.spend;
    const ordersCount = metrics.orders;
    const roomPreviewLift = metrics.roomPreviewLift ?? 0;
    const cac = ordersCount > 0 ? Math.round((actualSpend / ordersCount) * 100) / 100 : 0;
    const grossRevenue = ordersCount * 45; // average order value benchmark
    const netContribution = Math.round((grossRevenue * 0.3 - actualSpend) * 100) / 100;

    let status: "active" | "held" | "scaled" = "active";
    if (netContribution < 0 || (cac > 35 && roomPreviewLift < 10)) {
      status = "held";
    } else if (targetBudget > baselineCap) {
      status = "scaled";
    }

    return {
      channel: channelId,
      targetBudget,
      actualSpend,
      cac,
      ordersCount,
      netContribution,
      roomPreviewLift,
      status,
    };
  });

  const totalBudget = items.reduce((sum, i) => sum + i.targetBudget, 0);
  const totalActualSpend = items.reduce((sum, i) => sum + i.actualSpend, 0);
  const totalOrders = items.reduce((sum, i) => sum + i.ordersCount, 0);
  const blendedCac = totalOrders > 0 ? Math.round((totalActualSpend / totalOrders) * 100) / 100 : 0;
  const projectedProfitLift = items.reduce((sum, i) => sum + i.netContribution, 0);

  return {
    planId: generateBudgetPlanId(weekStarting),
    weekStarting,
    items,
    totalBudget,
    totalActualSpend,
    blendedCac,
    projectedProfitLift,
  };
}

export function buildBudgetExceptionQueue(
  plan: WeeklyChannelBudgetPlan,
): BudgetExceptionQueue {
  const exceptions: BudgetExceptionItem[] = [];
  let totalHeldCapital = 0;

  for (const item of plan.items) {
    if (item.status === "held" || item.netContribution < 0) {
      totalHeldCapital += item.targetBudget;

      let reason: BudgetExceptionItem["reason"] = "negative_contribution";
      let recommendedAction = "Pause spend until CAC drops or room-preview lift reaches +15%.";

      if (item.netContribution < 0) {
        reason = "negative_contribution";
        recommendedAction = `Reallocate $${item.targetBudget} cap to top-performing positive contribution channels.`;
      } else if (item.cac > 35) {
        reason = "cac_too_high";
        recommendedAction = `Reduce channel bid cap from $${item.cac} to $25.00 threshold.`;
      }

      exceptions.push({
        channel: item.channel,
        reason,
        currentCac: item.cac,
        actualSpend: item.actualSpend,
        netContribution: item.netContribution,
        recommendedAction,
      });
    }
  }

  const summaryMessage =
    exceptions.length === 0
      ? "All active channels operate with positive contribution margins and healthy LTV:CAC."
      : `Held $${totalHeldCapital} across ${exceptions.length} non-performing or negative-contribution channel(s).`;

  return {
    exceptions,
    totalHeldCapital,
    summaryMessage,
  };
}
