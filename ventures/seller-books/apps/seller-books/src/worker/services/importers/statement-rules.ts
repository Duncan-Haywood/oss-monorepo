// Merchant rules for a bank or card statement: what a line most likely is for a reseller, and whether it
// belongs on the Expenses page at all. Pure: no DB.
//
// A statement mixes business costs with things that must NOT be entered as expenses here:
// - inventory bought at thrift stores, bins and liquidation sites goes under Inventory, so its cost reaches
//   Schedule C Part III (cost of goods sold) in the year the item sells, not the year it was bought;
// - marketplace fees and shipping labels bought on eBay, Poshmark and the rest are already in that
//   platform's report, so entering the card charge again counts them twice;
// - fuel is covered by the standard mileage rate when the seller keeps the mileage log (the IRS lets you
//   use the standard rate or actual car costs, not both: Publication 463, chapter 4);
// - card payments and transfers move money between accounts and are not purchases.
//
// So a rule gives a category suggestion plus `include`: true only where the line is very likely a
// deductible business cost that no report already has (postage bought directly, packaging suppliers,
// listing software, a storage unit). Everything else starts unticked with the reason shown, and the seller
// decides. These are conventions to help sorting, not tax advice.
import type { ExpenseCategory } from "@shared/enums";
import type { LearnedChoice, LeftOutMerchant } from "./statement-memory";

export type RuleKind =
  | "expense"
  | "ambiguous"
  | "inventory"
  | "marketplace"
  | "fuel"
  | "transfer"
  | "unknown";

export interface Suggestion {
  kind: RuleKind;
  category: ExpenseCategory;
  include: boolean;
  /** Shown next to the row when it starts unticked or needs a look. */
  reason: string | null;
  /** The keyword that matched, for the page and the tests. */
  matched: string | null;
  /** The seller's own earlier choice for this merchant, when one replaced the rule (statement-memory.ts). */
  learned?: LearnedChoice;
  /** The merchant the seller asked to leave out, when that unticked the row (statement-memory.ts). */
  leftOut?: LeftOutMerchant;
}

interface Rule {
  kind: RuleKind;
  category: ExpenseCategory;
  include: boolean;
  reason: string | null;
  keywords: readonly string[];
}

// Checked in order: the first rule with a matching keyword wins. Keywords match whole words of the
// description after it is upper-cased and its punctuation turned into spaces ("PAYPAL *VENDOO" ->
// "PAYPAL VENDOO"), so "BP" does not match "BPS" and "UPS" does not match "CUPS".
const RULES: readonly Rule[] = [
  {
    kind: "marketplace",
    category: "commissions_fees",
    include: false,
    reason:
      "A marketplace charge: its fees and labels are already in that platform's report. Tick it only if the report leaves it out.",
    keywords: ["EBAY", "POSHMARK", "MERCARI", "WHATNOT", "DEPOP", "ETSY", "GRAILED", "TRADESY"],
  },
  {
    kind: "inventory",
    category: "other",
    include: false,
    reason:
      "Looks like inventory: add it under Inventory, so its cost counts when the item sells, not now.",
    keywords: [
      "GOODWILL",
      "SAVERS",
      "VALUE VILLAGE",
      "SALVATION ARMY",
      "THRIFT",
      "THRIFTS",
      "ESTATE SALE",
      "ESTATE SALES",
      "YARD SALE",
      "GARAGE SALE",
      "BSTOCK",
      "B STOCK",
      "LIQUIDATION",
      "LIQUIDATIONS",
      "PLATOS CLOSET",
      "PLATO S CLOSET",
      "TJ MAXX",
      "TJMAXX",
      "MARSHALLS",
      "ROSS STORES",
      "BURLINGTON",
      "HOMEGOODS",
      "OFFERUP",
      "FB MARKETPLACE",
      "SHPGOODWILL",
    ],
  },
  {
    kind: "fuel",
    category: "travel",
    include: false,
    reason:
      "Fuel: the standard mileage rate in your mileage log already covers gas. Tick it only if you deduct actual car costs instead.",
    keywords: [
      "SHELL",
      "EXXON",
      "EXXONMOBIL",
      "MOBIL",
      "CHEVRON",
      "BP",
      "SUNOCO",
      "CIRCLE K",
      "WAWA",
      "SPEEDWAY",
      "MARATHON PETRO",
      "VALERO",
      "QUIKTRIP",
      "QT",
      "CITGO",
      "SHEETZ",
      "CASEYS",
      "PILOT",
      "LOVES",
      "ARCO",
      "PHILLIPS 66",
      "CONOCO",
      "RACETRAC",
      "MURPHY USA",
      "FUEL",
      "GASOLINE",
    ],
  },
  {
    kind: "expense",
    category: "shipping_postage",
    include: true,
    reason: null,
    keywords: [
      "USPS",
      "POSTAL SERVICE",
      "UPS",
      "FEDEX",
      "DHL",
      "PIRATE SHIP",
      "PIRATESHIP",
      "SHIPPO",
      "STAMPS COM",
      "STAMPSCOM",
      "SHIPSTATION",
      "EASYPOST",
    ],
  },
  {
    kind: "expense",
    category: "supplies",
    include: true,
    reason: null,
    keywords: [
      "ULINE",
      "STAPLES",
      "OFFICE DEPOT",
      "OFFICEMAX",
      "PAPER MART",
      "PAPERMART",
      "ECOENCLOSE",
      "NOISSUE",
      "PACKLANE",
    ],
  },
  {
    kind: "expense",
    category: "software_subscriptions",
    include: true,
    reason: null,
    keywords: [
      "VENDOO",
      "LIST PERFECTLY",
      "LISTPERFECTLY",
      "PRIMELISTER",
      "CROSSLIST",
      "FLYP",
      "CLOSO",
      "CANVA",
      "ADOBE",
      "QUICKBOOKS",
      "INTUIT",
      "GOOGLE WORKSPACE",
      "GSUITE",
      "DROPBOX",
      "SHOPIFY",
      "SQUARESPACE",
      "GODADDY",
      "OPENAI",
      "CHATGPT",
      "PHOTOROOM",
      "REMOVE BG",
    ],
  },
  {
    kind: "expense",
    category: "advertising",
    include: true,
    reason: null,
    keywords: ["FACEBK", "META ADS", "FACEBOOK ADS", "GOOGLE ADS", "PINTEREST ADS", "TIKTOK ADS"],
  },
  {
    kind: "expense",
    category: "rent",
    include: true,
    reason: null,
    keywords: [
      "PUBLIC STORAGE",
      "EXTRA SPACE",
      "CUBESMART",
      "LIFE STORAGE",
      "STORAGE UNIT",
      "SELF STORAGE",
      "UHAUL STORAGE",
      "U HAUL STORAGE",
    ],
  },
  {
    kind: "ambiguous",
    category: "utilities",
    include: false,
    reason:
      "Phone or internet: only the business share counts. Tick it and enter that share, or add the share by hand.",
    keywords: [
      "VERIZON",
      "AT T",
      "ATT",
      "T MOBILE",
      "TMOBILE",
      "COMCAST",
      "XFINITY",
      "SPECTRUM",
      "COX COMM",
      "CRICKET",
      "MINT MOBILE",
      "GOOGLE FI",
    ],
  },
  {
    kind: "ambiguous",
    category: "supplies",
    include: false,
    reason: "This store sells everything: tick it only if the order was for the business.",
    keywords: [
      "AMAZON",
      "AMZN",
      "WALMART",
      "WAL MART",
      "TARGET",
      "COSTCO",
      "SAMS CLUB",
      "DOLLAR TREE",
      "DOLLAR GENERAL",
      "FAMILY DOLLAR",
      "HOME DEPOT",
      "LOWES",
      "MICHAELS",
      "HOBBY LOBBY",
      "TEMU",
      "ALIEXPRESS",
    ],
  },
  {
    kind: "transfer",
    category: "other",
    include: false,
    reason:
      "A payment or transfer, not a purchase. Tick it only if it paid for something for the business.",
    keywords: [
      "PAYMENT THANK YOU",
      "AUTOPAY",
      "AUTO PAY",
      "ONLINE PAYMENT",
      "TRANSFER",
      "XFER",
      "ZELLE",
      "VENMO",
      "CASH APP",
      "ATM",
      "WITHDRAWAL",
      "CHECK",
    ],
  },
];

/** "PAYPAL *VENDOO 4029357733 CA" -> " PAYPAL VENDOO 4029357733 CA " (padded for whole-word matching). */
export function normDescription(s: string): string {
  return ` ${s
    .toUpperCase()
    .replace(/['’]/g, "")
    .replace(/&/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()} `;
}

const NORMALIZED = RULES.map((r) => ({
  rule: r,
  keys: r.keywords.map((k) => ({ raw: k, norm: normDescription(k) })),
}));

export function suggest(description: string): Suggestion {
  const d = normDescription(description);
  for (const { rule, keys } of NORMALIZED) {
    for (const k of keys) {
      if (d.includes(k.norm)) {
        return {
          kind: rule.kind,
          category: rule.category,
          include: rule.include,
          reason: rule.reason,
          matched: k.raw,
        };
      }
    }
  }
  return {
    kind: "unknown",
    category: "other",
    include: false,
    reason: "No rule matched: pick a category and tick it if it was for the business.",
    matched: null,
  };
}
