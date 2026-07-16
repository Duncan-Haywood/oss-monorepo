export {
  MAX_COMMERCE_SKU_ID_LENGTH,
  MAX_COMMERCE_SKUS,
  MAX_SKU_DESCRIPTION_LENGTH,
  MAX_SKU_NAME_LENGTH,
  MAX_SKU_PRICE_CENTS,
  type CommerceCatalog,
  type CommerceSku,
  type UpsertCommerceCatalogInput,
} from "./types";

export {
  MAX_COMMERCE_CHECKOUT_SKU_ID_LENGTH,
  MAX_COMMERCE_CHECKOUT_SLUG_LENGTH,
  parseCommerceCheckoutSkuId,
  parseCommerceCheckoutSlug,
  type ParseCommerceCheckoutFieldResult,
} from "./checkout-fields";

export {
  catalogHasUnsyncedSku,
  commerceOrderPaidInquiryMessage,
  commerceOrderRequestMessage,
  formatPriceUsd,
  leadEligibleForCommerceCatalog,
  leadStageEligibleForCommerceCatalog,
  listCommerceCatalogsMissing,
  listCommerceCatalogsUnsynced,
  newCommerceSkuId,
  normalizeCommerceItems,
  preserveCommerceStripeIds,
  type NormalizeCommerceItemsResult,
} from "./catalog";

// Do NOT re-export loadPreviewCommerceItems from this barrel — it lazy-imports
// `@/lib/db` (`server-only`), and leads-client.tsx (`"use client"`) imports from
// `@/lib/commerce`. A barrel re-export pulls db into the client graph and breaks
// `next build` (PR #313 regression). Import from `@/lib/commerce/preview-commerce`
// in Server Components / route handlers only.

export {
  archiveCommerceStripeProducts,
  archiveOrphanCommerceStripeProducts,
  commerceSkuStripeKey,
  listOrphanCommerceStripeProducts,
  syncCommerceCatalogToStripe,
  type OrphanCommerceStripeProduct,
  type StripeProductsAndPrices,
  type SyncedCommerceSku,
} from "./stripe-sync";

export {
  isCommerceOrderPaidOut,
  newCommerceOrderId,
  sortCommerceOrdersNewestFirst,
  sumCommerceOrdersRevenueUsd,
  summarizeCommerceOrdersByLead,
  type CommerceOrderRecord,
  type CommerceOrdersByLeadSummary,
  type InsertCommerceOrderInput,
} from "./orders";

export {
  commerceBuyNowClientReceiptSubject,
  formatCommerceBuyNowClientReceiptHtml,
  leadEligibleForCommerceBuyNowClientReceipt,
} from "./client-receipt";

export {
  hasCommerceCheckoutInquiryForSession,
  inquiryMentionsStripeSession,
  planCommerceWebhookSideEffects,
  type CommerceSideEffectPlan,
  type CommerceSideEffectReason,
} from "./side-effect-recovery";
