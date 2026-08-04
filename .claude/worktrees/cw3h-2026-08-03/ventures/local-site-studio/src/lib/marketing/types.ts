/**
 * Marketing automation types — see /docs/marketing-automation
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

export type AutomationLevel = "generate_only" | "generate_schedule" | "generate_schedule_optimize";

export type ApprovalMode = "none" | "optional" | "required";

export type MarketingPackageTier =
  | "copy_pack"
  | "social_email"
  | "full_marketing";

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
