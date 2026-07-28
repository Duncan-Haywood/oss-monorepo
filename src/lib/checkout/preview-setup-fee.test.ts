import { describe, expect, it, vi } from "vitest";
import type { LeadPipelineStage } from "@/lib/leads/types";
import type { OrderRecord } from "@/lib/orders/types";
import { loadPreviewSetupFeeWaived } from "./preview-setup-fee";

function order(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: "ord_1",
    leadSlug: "paid-cafe",
    stripeSessionId: "cs_test_1",
    tier: "starter",
    commerceAddon: false,
    amountPaid: 500,
    createdAt: "2026-07-16T00:00:00.000Z",
    ...overrides,
  };
}

describe("loadPreviewSetupFeeWaived", () => {
  it.each([
    "new",
    "preview_sent",
    "outreach_sent",
    "discovery_call",
    "closed",
  ] as LeadPipelineStage[])(
    "skips the orders lookup and returns false for ineligible stage %s",
    async (stage) => {
      const listOrdersByLeadSlug = vi.fn(async () => [order()]);

      await expect(
        loadPreviewSetupFeeWaived({ stage }, "cold-lead", { listOrdersByLeadSlug }),
      ).resolves.toBe(false);
      expect(listOrdersByLeadSlug).not.toHaveBeenCalled();
    },
  );

  it.each(["paid", "live"] as LeadPipelineStage[])(
    "returns true for a %s lead with a prior order",
    async (stage) => {
      const listOrdersByLeadSlug = vi.fn(async () => [order()]);

      await expect(
        loadPreviewSetupFeeWaived({ stage }, "paid-cafe", { listOrdersByLeadSlug }),
      ).resolves.toBe(true);
      expect(listOrdersByLeadSlug).toHaveBeenCalledWith("paid-cafe");
    },
  );

  it("returns false for a paid/live lead with no orders yet (e.g. a manually-staged CRM row)", async () => {
    const listOrdersByLeadSlug = vi.fn(async () => []);

    await expect(
      loadPreviewSetupFeeWaived({ stage: "paid" }, "paid-cafe", { listOrdersByLeadSlug }),
    ).resolves.toBe(false);
  });
});
