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

export {
  formatPackBusinessHours,
  MAX_MARKETING_CONTENT_TYPES_PER_REQUEST,
  MAX_MARKETING_GENERATE_LEAD_ID_LENGTH,
  MAX_PACK_BUSINESS_HOURS_LENGTH,
  normalizeMarketingGenerateBusiness,
} from "./generate-limits";

export {
  formatMarketingPackEmailHtml,
  leadEligibleForMarketingPackDelivery,
  marketingPackDeliverySubject,
} from "./deliver-pack";

export { businessContextFromLead, monthlyPackRequestForLead } from "./build-request";
