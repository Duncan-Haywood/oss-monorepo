// Plain-language explanation of the three review tiers. The live routing preview table lives in
// components/automation/automation-preview.tsx.
import type { ReviewTier } from "@shared/enums";
import { BadgeCheck, MousePointerClick, ScanSearch } from "lucide-react";
import { TIER_DESCRIPTIONS, TIER_LABELS } from "./routing-preview";

const TIER_ICON = { auto: BadgeCheck, one_click: MousePointerClick, full_review: ScanSearch };
export const TIER_TONE: Record<ReviewTier, "success" | "info" | "warning"> = {
  auto: "success",
  one_click: "info",
  full_review: "warning",
};

export function TierCards() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {(["auto", "one_click", "full_review"] as const).map((tier) => {
        const Icon = TIER_ICON[tier];
        return (
          <div key={tier} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <Icon className="h-5 w-5 text-brand-600" aria-hidden />
              <p className="font-medium text-neutral-900">{TIER_LABELS[tier]}</p>
            </div>
            <p className="mt-2 text-sm text-neutral-600">{TIER_DESCRIPTIONS[tier]}</p>
          </div>
        );
      })}
    </div>
  );
}
