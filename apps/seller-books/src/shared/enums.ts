// Enumerations shared by the Worker and the SPA. Stored as plain text in D1.

export const MEMBER_ROLES = ["owner", "admin", "editor", "viewer"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** Ordered from least to most privileged; used by requireRole(). */
export const ROLE_RANK: Record<MemberRole, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

export const PLATFORMS = ["ebay", "poshmark", "mercari", "whatnot", "depop", "etsy"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  ebay: "eBay",
  poshmark: "Poshmark",
  mercari: "Mercari",
  whatnot: "Whatnot",
  depop: "Depop",
  etsy: "Etsy",
};

/** A sale row is an order (money in) or a refund/return (money back out), dated when it happened. */
export const SALE_KINDS = ["order", "refund"] as const;
export type SaleKind = (typeof SALE_KINDS)[number];

/**
 * Marketplace charges. Each importer maps the report's own fee columns to these kinds; a report that only
 * gives one combined fee (or only the net) is stored as `marketplace_fee` (never split by guessed rates).
 */
export const FEE_KINDS = [
  "final_value", // eBay final value fee (variable part)
  "per_order", // eBay per-order fixed part of the final value fee
  "commission", // Poshmark / Whatnot commission, Mercari / Depop selling fee
  "transaction", // Etsy transaction fee
  "payment_processing",
  "listing", // Etsy listing / renewal fees
  "advertising", // promoted / boosted listings, Etsy ads and offsite ads
  "international",
  "regulatory",
  "marketplace_fee", // a combined fee the report does not break down
  "other",
] as const;
export type FeeKind = (typeof FEE_KINDS)[number];

export const FEE_KIND_LABELS: Record<FeeKind, string> = {
  final_value: "Final value fee",
  per_order: "Per-order fee",
  commission: "Commission / selling fee",
  transaction: "Transaction fee",
  payment_processing: "Payment processing",
  listing: "Listing fees",
  advertising: "Ads / promoted listings",
  international: "International fee",
  regulatory: "Regulatory fee",
  marketplace_fee: "Marketplace fees (not itemised in report)",
  other: "Other fees",
};

/** Account-level charges that are not order fees: postage bought through the platform, subscriptions. */
export const CHARGE_KINDS = ["shipping_label", "subscription", ...FEE_KINDS] as const;
export type ChargeKind = (typeof CHARGE_KINDS)[number];

/**
 * Business expense categories, each mapped to a Schedule C line (worksheet only, see
 * services/books/schedule-c.ts). The mapping is a common convention, not advice.
 */
export const EXPENSE_CATEGORIES = [
  "advertising",
  "commissions_fees",
  "insurance",
  "legal_professional",
  "office",
  "rent",
  "repairs",
  "supplies",
  "taxes_licenses",
  "travel",
  "meals",
  "utilities",
  "shipping_postage",
  "software_subscriptions",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const INVENTORY_STATUSES = ["in_stock", "sold", "written_off", "personal_use"] as const;
export type InventoryStatus = (typeof INVENTORY_STATUSES)[number];
