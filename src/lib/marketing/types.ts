/**
 * Marketing automation types — see docs/MARKETING-AUTOMATION.md
 */

export type MarketingContentType =
  | "gbp_post"
  | "facebook_caption"
  | "instagram_caption"
  | "email_campaign"
  | "review_request_email"
  | "local_seo_meta"
  | "seasonal_promo"
  | "ad_copy";

export type AutomationLevel = "generate" | "schedule" | "optimize";

export type ApprovalMode = "none" | "optional" | "required";

export type MarketingPackageTier =
  | "copy_pack"
  | "essentials"
  | "pro";

export interface BusinessContext {
  businessName: string;
  category: string;
  city: string;
  state?: string;
  phone?: string;
  hours?: string;
  services: string[];
  tagline?: string;
  websiteUrl?: string;
  tone?: "friendly" | "professional" | "casual";
}

export interface GenerateMarketingRequest {
  leadId: string;
  contentTypes: MarketingContentType[];
  automationLevel: AutomationLevel;
  approvalMode?: ApprovalMode;
  business: BusinessContext;
}

export interface MarketingContentVariant {
  contentType: MarketingContentType;
  title?: string;
  body: string;
  cta?: string;
  hashtags?: string[];
  scheduledFor?: string;
  platformMeta?: Record<string, string>;
}

export interface GenerateMarketingResponse {
  leadId: string;
  variants: MarketingContentVariant[];
  generatedAt: string;
  packageTier?: MarketingPackageTier;
}

export interface MarketingGenerator {
  generate(request: GenerateMarketingRequest): Promise<GenerateMarketingResponse>;
}
