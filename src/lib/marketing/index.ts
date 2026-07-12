export type {
  ApprovalMode,
  AutomationLevel,
  BusinessContext,
  GenerateMarketingRequest,
  GenerateMarketingResponse,
  MarketingContentType,
  MarketingContentVariant,
  MarketingGenerator,
  MarketingPackageTier,
} from "./types";

export type { MarketingPack, MarketingPackGeneratorKind, UpsertMarketingPackInput } from "./pack";

export {
  AnthropicMarketingGenerator,
  createDefaultMarketingGenerator,
  getMarketingGenerator,
  resetMarketingGeneratorForTests,
  setMarketingGenerator,
  StubMarketingGenerator,
} from "./generators";

export {
  bestMarketingOrderTier,
  contentTypeLabel,
  isMarketingBundleTier,
  leadEligibleForMarketingPack,
  leadNeedsMarketingPackForMonth,
  leadStageEligibleForMarketingPack,
  listMarketingPacksDue,
  marketingMonthKey,
  MONTHLY_MARKETING_PACK_TYPES,
  packageTierForOrderTier,
} from "./monthly-pack";

export { businessContextFromLead, monthlyPackRequestForLead } from "./build-request";
