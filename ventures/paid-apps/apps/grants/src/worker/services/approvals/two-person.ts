// Bridge to the org's two-person rule (org_settings.twoPersonRuleAboveCents, resolved with the
// automation preset by services/review/automation.ts). That module is the single source of truth
// for whether the rule applies (including "unknown ask = two people"); combined with an approval
// policy, the stricter requirement wins (see requiredApprovals in @shared/approvals).
import type { OrgSettingsRow } from "../pipeline/steps";
import { requiredApprovals, resolveAutomation } from "../review/automation";

export function twoPersonThresholdCents(settings: OrgSettingsRow): number | null {
  return resolveAutomation(settings).twoPersonRuleAboveCents;
}

/** Whether the two-person rule applies to an ask (at least two distinct people must approve). */
export function twoPersonRuleApplies(
  settings: OrgSettingsRow,
  requestedAmountCents: number | null,
): boolean {
  return requiredApprovals(resolveAutomation(settings), requestedAmountCents) === 2;
}
