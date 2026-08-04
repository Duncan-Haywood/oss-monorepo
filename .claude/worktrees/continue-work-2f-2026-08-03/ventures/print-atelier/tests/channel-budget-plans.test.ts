import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import {
  createWeeklyChannelBudgetPlan,
  buildBudgetExceptionQueue,
  recordWeeklyChannelBudgetPlan,
  getWeeklyChannelBudgetPlans,
  clearWeeklyChannelBudgetPlans,
} from "../src/lib/channel-budget-plans.ts";
import { allocateWeeklyChannelBudget } from "../src/lib/marketplace.ts";

beforeEach(() => {
  clearWeeklyChannelBudgetPlans();
});

test("creates and records weekly channel budget plan", () => {
  const allocation = allocateWeeklyChannelBudget();
  const plan = createWeeklyChannelBudgetPlan("2026-07-27", allocation, {
    meta_ads: { spend: 40, orders: 3, roomPreviewLift: 15 },
    google_shopping: { spend: 30, orders: 1, roomPreviewLift: 5 },
  });

  assert.ok(plan.planId.startsWith("plan_2026-07-27"));
  assert.ok(plan.items.length > 0);

  recordWeeklyChannelBudgetPlan(plan);
  const plans = getWeeklyChannelBudgetPlans();
  assert.equal(plans.length, 1);
  assert.equal(plans[0].weekStarting, "2026-07-27");
});

test("identifies negative contribution or high CAC channels in exception queue", () => {
  const allocation = allocateWeeklyChannelBudget();
  const plan = createWeeklyChannelBudgetPlan("2026-07-27", allocation, {
    meta_ads: { spend: 50, orders: 1, roomPreviewLift: 0 },
  });

  const queue = buildBudgetExceptionQueue(plan);
  assert.ok(queue.exceptions.length > 0);
  assert.ok(queue.totalHeldCapital > 0);
  assert.ok(queue.summaryMessage.includes("Held"));
});
