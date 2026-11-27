// Account names for the QuickBooks Online journal export (worker: services/books/journal.ts; client: the
// P&L page, which keeps the seller's own names in the browser).
export const JOURNAL_ACCOUNT_KEYS = [
  "sales",
  "shipping",
  "refunds",
  "advertising",
  "fees",
  "postage",
  "subscriptions",
  "cogs",
  "inventory",
  "clearing",
] as const;
export type JournalAccountKey = (typeof JOURNAL_ACCOUNT_KEYS)[number];
export type JournalAccounts = Record<JournalAccountKey, string>;

/** Default account names. `{platform}` in the clearing name becomes the platform's label. */
export const DEFAULT_JOURNAL_ACCOUNTS: JournalAccounts = {
  sales: "Sales",
  shipping: "Shipping Income",
  refunds: "Refunds and Allowances",
  advertising: "Advertising",
  fees: "Marketplace Fees",
  postage: "Postage and Shipping",
  subscriptions: "Software and Subscriptions",
  cogs: "Cost of Goods Sold",
  inventory: "Inventory Asset",
  clearing: "{platform} Clearing",
};

export const JOURNAL_ACCOUNT_LABELS: Record<JournalAccountKey, string> = {
  sales: "Item sales (income)",
  shipping: "Shipping charged to buyers (income)",
  refunds: "Refunds (contra-income)",
  advertising: "Ads and promoted listings (expense)",
  fees: "Marketplace fees (expense)",
  postage: "Postage and shipping labels (expense)",
  subscriptions: "Platform subscriptions (expense)",
  cogs: "Cost of goods sold (expense)",
  inventory: "Inventory (asset)",
  clearing: "Clearing account, one per platform ({platform} is replaced)",
};
