// Single source of the site's words: product name, platforms, pricing tiers, FAQ. build.mjs renders
// every page, sitemap.xml, robots.txt and llms.txt from this file, and the tests read it, so a fact
// lives in one place.
//
// Copy rules (docs/PRICING.md, README.md): the product's status comes from one switch (src/launch.mjs):
// before APP_URL, early access and nothing sold; after, open now on the Free plan, paid plans "not on
// sale yet" until PAID_PLANS_ON. No testimonials, no
// savings or refund claims, no ratings; not tax advice; 1099-K stated calmly and correctly (federal
// threshold $20,000 and 200 transactions); no fee percentages we would have to keep current — the
// product reads what each seller was actually charged from their own reports.

/** PROVISIONAL product name (README.md): not cleared for trademark, may change before launch. */
export const SITE_NAME = "Seller Books";

/** Public URL (origin + base path, no trailing slash). PROVISIONAL host: see README.md. */
export const SITE_URL = "https://marisstella.app/seller-books";

/** Base path every page and asset is served under (keep wrangler.jsonc and src/worker.mjs in step). */
export const BASE_PATH = "/seller-books";

export const CONTACT_EMAIL = "hello@marisstella.app";

/** Bumped whenever EARLY_ACCESS_CONSENT_TEXT changes, so each signup records the wording it saw. */
export const EARLY_ACCESS_CONSENT_VERSION = "2026-11-24";

export const EARLY_ACCESS_CONSENT_TEXT =
  "We'll email you a link to confirm. After that we'll only email you about early access to Seller Books (an invite when it's ready, and the occasional progress note). Every email has an unsubscribe link.";

export const EARLY_ACCESS_SUBSCRIBE_MESSAGE =
  "Thanks! If this address can receive our emails, a confirmation link is on its way. Check your inbox (and spam folder) to finish signing up.";

import { launch } from "./launch.mjs";

export const TAGLINE = "True profit and Schedule C books for resellers";

const SUMMARY_BASE =
  "Seller Books is bookkeeping for people who resell on eBay, Poshmark, Mercari, Whatnot, Depop, Etsy, Shopify, Amazon, TikTok Shop and Square. It brings your sales from every platform into one ledger, takes out the fees each platform actually charged, matches what you paid for each item, logs your sourcing miles, and builds a Schedule C worksheet you or your tax preparer can work from.";

/**
 * The Free plan, as apps/seller-books/src/shared/plans.ts sets it (test/site.test.mjs reads that file
 * and checks these numbers).
 */
export const FREE_PLAN = { platforms: 1, ordersPerMonth: 25, members: 1 };
// The copy says "one platform": change it with FREE_PLAN.platforms.

/** One sentence on what can be used today and what is for sale (launch.mjs). */
export function statusSentence() {
  const l = launch();
  if (!l.open) return "It is in early access: nothing is for sale yet.";
  const free = `It is open now: free for one platform and up to ${FREE_PLAN.ordersPerMonth} orders a month, with no card`;
  return l.paidOn
    ? `${free}, and paid plans for more platforms and orders.`
    : `${free}. Paid plans for more platforms and orders are not on sale yet.`;
}

/** The product summary with its current status (home lead, JSON-LD, llms.txt). */
export const summary = () => `${SUMMARY_BASE} ${statusSentence()}`;

export const NOT_TAX_ADVICE =
  "Seller Books is bookkeeping software, not a tax adviser. It organises your numbers; what you deduct and how you file is your decision, or your tax professional's.";

/**
 * Platforms. Fee *components* only, never rates: rates change and differ by category, and the product
 * reads the amount each seller was charged from their own reports instead of a table that goes stale.
 */
export const PLATFORMS = [
  {
    slug: "ebay",
    name: "eBay",
    what: "auctions and fixed-price listings across almost every category",
    fees: [
      "Final value fees, charged on the total the buyer paid (which can include shipping and sales tax)",
      "A per-order fee on each sale",
      "Promoted listing (advertising) fees, when you use them",
      "Store subscription fees, if you have an eBay Store",
      "Shipping labels bought through eBay, and international fees where they apply",
    ],
    quirks: [
      "eBay collects and sends marketplace sales tax for most US states, so the buyer total is larger than your sale price. Sales tax eBay collected is not your income; the ledger keeps it apart from gross receipts.",
      "Fees, refunds, label costs and payouts arrive as separate lines on different days, so one sale is spread across several rows in eBay's transaction report. Seller Books puts them back together per order.",
    ],
    report: "the transaction report you can download from the Payments tab in Seller Hub",
  },
  {
    slug: "poshmark",
    name: "Poshmark",
    what: "clothing, shoes, accessories and home goods, sold through listings, offers and Posh Shows",
    fees: [
      "Poshmark's selling fee, taken from each sale before it reaches your balance",
      "Shipping discounts you offered to buyers, which come out of your earnings",
      "Any boosted listing or promotion costs",
    ],
    quirks: [
      "Your earnings are what is left after the fee, so the sale price and the money you receive are different numbers. Gross receipts on Schedule C start from the sale, with the fee as an expense, not from the net payout.",
      "Bundles hold several items in one order. Each item keeps its own cost so the profit per item is still right.",
    ],
    report: "the sales history and earnings records in your Poshmark account",
  },
  {
    slug: "mercari",
    name: "Mercari",
    what: "general secondhand goods, from electronics to collectibles",
    fees: [
      "Mercari's selling and payment processing fees (the structure has changed several times, which is why the ledger uses what you were charged rather than a published rate)",
      "Shipping labels you paid for, when you pay shipping",
      "Promotion costs and instant-payout fees, when you use them",
    ],
    quirks: [
      "Because Mercari's fees have changed over time, last year's sales and this year's can carry different fee rules. Reading the charged amount per sale keeps both years right.",
    ],
    report: "the sales history in your Mercari account",
  },
  {
    slug: "whatnot",
    name: "Whatnot",
    what: "live-stream auctions and sales, from trading cards to clothing",
    fees: [
      "Whatnot's commission on each sale",
      "Payment processing fees",
      "Shipping you cover yourself, for example on giveaways or free-shipping promotions",
    ],
    quirks: [
      "One live show can produce dozens of small sales in an evening, often from mystery lots and bulk buys. Splitting a lot's cost across the items in it is how each sale gets a real cost of goods.",
      "Giveaways are real costs: the item you gave away and the shipping you paid. The ledger records them as costs of the show, not as sales.",
    ],
    report: "the order and payout records in your Whatnot seller account",
  },
  {
    slug: "depop",
    name: "Depop",
    what: "secondhand and vintage fashion",
    fees: [
      "Payment processing fees on each sale",
      "Boosted listing fees, when you use boosting",
      "Shipping labels you paid for",
    ],
    quirks: [
      "Depop's US fee structure changed in recent years, so older and newer sales can carry different fees. As with every platform, the ledger uses the amount actually charged on each sale.",
    ],
    report: "the sales records in your Depop account",
  },
  {
    slug: "etsy",
    name: "Etsy",
    what: "vintage items (20 years or older), handmade goods and craft supplies",
    fees: [
      "Listing fees, including the renewal fee each time an item sells or auto-renews",
      "Transaction fees on the item price and shipping",
      "Payment processing fees",
      "Etsy Ads and Offsite Ads fees, when they apply",
      "Shipping labels bought through Etsy",
    ],
    quirks: [
      "Etsy bills several kinds of fees on different schedules, and your payment account statement mixes them with deposits. The ledger sorts each one to the sale or the month it belongs to.",
      "If you sell vintage on Etsy and secondhand elsewhere, the same item could have been listed on several platforms. The cost is counted once, on the sale that actually happened.",
    ],
    report: "the monthly payment account statement and orders download from Etsy",
  },
  {
    slug: "shopify",
    name: "Shopify",
    what: "your own online store, often alongside the marketplaces, for repeat buyers and items you would rather not pay a marketplace fee on",
    fees: [
      "Shopify Payments processing fees, taken from each charge before it reaches your payout",
      "Chargebacks, and the chargeback fee Shopify records as a separate adjustment",
      "Your Shopify plan and Shopify Shipping labels, which are billed on your Shopify bill rather than taken from sales",
    ],
    quirks: [
      "Sales and fees live in two different exports: the orders export has what each buyer paid, and the Shopify Payments transactions export has the fee on each charge. Seller Books reads both and counts each sale once, not once per file.",
      "Shopify uses one transaction type, adjustment, for chargeback fees, fee refunds and Shopify Capital repayments alike. A loan repayment is not a business cost, so Seller Books lists those lines for you to check instead of quietly deducting them.",
      "Orders from the Shop sales channel can have marketplace sales tax deducted by Shopify. Like sales tax a marketplace collects, it is not your income, and the ledger keeps it out of gross receipts.",
    ],
    report:
      "the orders export (Orders > Export) and the Shopify Payments transactions export (Finance > Payouts)",
  },
  {
    slug: "amazon",
    name: "Amazon",
    what: "retail and online arbitrage, books and wholesale lots, shipped yourself or sent in to Fulfillment by Amazon (FBA)",
    fees: [
      'Referral fees (the report\'s "selling fees"), a share of each sale that varies by category',
      "FBA fulfillment fees per unit, when Amazon ships the order",
      "FBA storage, removal and return-processing fees, billed as their own lines",
      "The monthly selling plan, and Sponsored Products advertising",
      "Shipping labels bought through Amazon when you ship the order yourself",
    ],
    quirks: [
      'Amazon collects and sends sales tax for every US state that requires it. The tax shows on each order line and is taken back out on the same line as "marketplace withheld tax", so it is never your income; the ledger keeps it apart from gross receipts.',
      "A refund gives back most of the referral fee but keeps a refund administration fee. The report nets the two, and Seller Books books what was actually credited.",
      "Reimbursements for stock Amazon lost or damaged arrive as adjustments. Seller Books books them as credits and tells you how many there were, because a preparer may want them as other income and the lost items marked written off.",
    ],
    report: "the Date Range Report, transaction kind (Payments > Reports Repository)",
  },
  {
    slug: "tiktok-shop",
    name: "TikTok Shop",
    what: "products sold through short videos, live streams and creators who promote your listings for a commission",
    fees: [
      "TikTok Shop's referral fee on each order, a share that varies by category and has changed over time",
      "Affiliate commissions paid to creators who sold your item, which can be larger than the referral fee",
      "The refund administration fee TikTok Shop keeps when it gives back the referral fee on a refund",
      "Shipping labels bought through TikTok Shop, netted against any shipping the buyer paid",
    ],
    quirks: [
      "A statement shows what TikTok Shop settled, not what reached your bank: a reserve can be held back and released later. Seller Books books each order from the statement's order lines and leaves reserve movements out, since they are not income or costs.",
      "Creator commissions are a cost of the sale like a fee, but they are paid to the creator, not to TikTok. Seller Books keeps them on their own line (as advertising) so you can see what affiliates cost you apart from the platform's own fee.",
      "TikTok Shop collects and sends sales tax for the US states that require a marketplace to. It appears on the statement but is never your income, and the ledger keeps it out of gross receipts.",
    ],
    report: "the statement's Order details sheet (Finances > Statements > Export), saved as CSV",
  },
  {
    slug: "square",
    name: "Square",
    what: "sales at flea markets, craft fairs, pop-ups and a booth in an antique mall, taken on a Square card reader or rung up in the Square app",
    fees: [
      "Square's processing fee on each card payment, which depends on how the card was taken (tapped, dipped or keyed in) and your plan",
      "No fee on cash you ring up in the Square app",
    ],
    quirks: [
      "Square's Net Total includes the sales tax you collected at the booth. That money is the state's, not your income, so Seller Books keeps it out of gross receipts and shows it apart, the way your sales tax return needs it.",
      "Selling a gift card is not a sale yet: the money is owed to whoever holds the card until it is spent. Seller Books leaves gift card sales out of income and counts the sale when the card is used; the fee Square took is still a cost.",
      "Tips and service charges are part of what you earned. A refund comes in on its own row with its own date, so the month it was given back is the month it lowers your sales.",
    ],
    report: "the Transactions CSV (Dashboard > Transactions > Export)",
  },
];
/**
 * What the product does (home page and llms.txt). Every item is in the app today
 * (apps/seller-books/README.md); add one only once it is.
 */
export const FEATURES = [
  {
    key: "profit",
    title: "True profit per sale, across every platform",
    body: "One ledger for eBay, Poshmark, Mercari, Whatnot, Depop, Etsy, Shopify, Amazon, TikTok Shop and Square. Each sale shows what the buyer paid, every fee the platform took, shipping you paid, and what the item cost you, so the number at the bottom is profit, not payout. Sales with no marketplace report (cash at a market, Facebook Marketplace, a local pickup paid by Venmo) are typed in and counted the same way.",
  },
  {
    key: "fees",
    title: "Fees from your own reports, not a rate table",
    body: "Platform fees change often and differ by category. Seller Books reads the fees you were actually charged from each platform's sales and payout reports, so the books match what landed in your bank account.",
  },
  {
    key: "cogs",
    title: "Cost of goods that follows the item",
    body: "Record what you paid when you source, including bulk lots and bins split across the items in them. When an item sells, on whichever platform, its cost moves to cost of goods sold; what's unsold stays as inventory at the end of the year. Already track purchases in a spreadsheet? Save it as CSV and import it; you see what will be added before anything is saved.",
  },
  {
    key: "stock",
    title: "Know what's sitting unsold, and whether a lot paid off",
    body: "A stock report shows how long your unsold items have been on the shelf and what they cost you, your sell-through and median days to sell on each platform, and for every bin, pallet or estate-sale haul how much of its cost its sales have earned back. Computed from your own imports and purchase records, nothing estimated.",
  },
  {
    key: "mileage",
    title: "Sourcing miles",
    body: "Log trips to thrift stores, estate sales and the post office with date, purpose and miles. The worksheet shows them with the IRS standard mileage rate for the trip's date, or keeps them as a record if you use actual car expenses instead. Already let a mileage tracker app record your drives? Export them as CSV and import the business trips, each with its purpose; personal drives are left out.",
  },
  {
    key: "schedule-c",
    title: "A Schedule C worksheet",
    body: "At year end you get your totals grouped the way Schedule C (Form 1040) asks for them: gross receipts, returns, cost of goods sold with beginning and ending inventory, car and truck, commissions and fees, supplies and other expenses, and the home office line by the simplified method if you keep your stock at home. One download gives your tax preparer everything behind it in a ZIP: the worksheet, every sale and fee, the closing inventory, the mileage log and the expenses, with a note saying which line each file adds up to. A worksheet for you or your tax preparer, not a filed return.",
  },
  {
    key: "quarterly",
    title: "Quarterly estimated tax from your own books",
    body: "For each of the four federal due dates (April, June, September and January), what to have paid so far, figured two ways: a quarter of the year's required payment (the smaller of 90% of this year's tax or 100% of last year's, 110% above $150,000 of AGI), and the annualized method on Form 2210 Schedule AI, which asks less early in the year when your sales come in the fourth quarter. It uses the profit in your books to each period's end. An estimate to check with your tax preparer, not tax advice.",
  },
  {
    key: "1099k-check",
    title: "Check a 1099-K against your books",
    body: "Type the figures from a platform's Form 1099-K and see them beside your books for that platform and year: item sales, then with the shipping buyers paid, then with the sales tax the platform collected. Type the monthly boxes too and the months that don't match are named, such as a month whose report you haven't imported or a sale dated at the end of one month by you and the start of the next by the platform. The form counts payments before refunds and fees, so it is usually higher than your profit; this shows where the difference comes from. Nothing you type is saved.",
  },
  {
    key: "quickbooks",
    title: "Monthly journal entries for QuickBooks Online",
    body: "Already keep your books in QuickBooks Online, or your accountant does? Download your sales as journal entries for its journal-entry import: one entry per platform per month, with sales, shipping charged, refunds, fees, ads, postage and subscriptions on their own accounts and the net on a clearing account for each platform, so a payout is a transfer from that account to your bank. You name the accounts; cost of goods can go against an inventory account if that is how your books work. Sales tax a platform collected stays out.",
  },
];

/** Schedule C groupings the worksheet shows. Line numbers from the IRS form; check the current year's instructions. */
export const SCHEDULE_C_LINES = [
  {
    line: "1",
    label: "Gross receipts or sales",
    from: "What buyers paid for your items (and shipping they paid you), not including sales tax a platform collected and remitted",
  },
  { line: "2", label: "Returns and allowances", from: "Refunds and partial refunds you gave" },
  {
    line: "4 (Part III, lines 35–42)",
    label: "Cost of goods sold",
    from: "Beginning inventory, plus purchases during the year, minus ending inventory",
  },
  {
    line: "9",
    label: "Car and truck expenses",
    from: "Business miles at the standard rate, or your actual costs",
  },
  {
    line: "10",
    label: "Commissions and fees",
    from: "Platform selling, transaction and processing fees",
  },
  { line: "22", label: "Supplies", from: "Mailers, tape, labels and other shipping supplies" },
  {
    line: "27a (Part V)",
    label: "Other expenses",
    from: "For example shipping labels, advertising, and subscriptions, each listed by name",
  },
  {
    line: "30",
    label: "Business use of home",
    from: "The simplified method: $5 a square foot of the space you use, up to 300 square feet, for the months you used it, never more than your profit. Storing inventory at home can count even if the space is not used only for the business, when home is the business's only fixed location; your tax preparer decides whether yours qualifies",
  },
];

/**
 * Paid tiers (docs/PRICING.md has the reasoning). Prices, orders and `includes` are the app's own
 * (apps/seller-books/src/shared/plans.ts; test/site.test.mjs checks them). Not charged until
 * PAID_PLANS_ON. `orders` = orders per month across all platforms, the main value and cost driver.
 */
export const TIERS = [
  {
    key: "side",
    name: "Side hustle",
    monthly: 15,
    annual: 150,
    orders: 100,
    platforms: "Up to 2 platforms",
    for: "Selling part time, on one or two platforms",
    includes: [
      "Up to 2 platforms",
      "About 100 orders a month (going over never locks anything)",
      "Fees, cost of goods and profit per sale",
      "Bulk lots split across items",
      "Mileage and expense logs",
      "Schedule C worksheet and CSV export",
    ],
  },
  {
    key: "fulltime",
    name: "Full time",
    monthly: 35,
    annual: 350,
    orders: 600,
    platforms: "Every platform",
    for: "Reselling is your main work and you crosslist",
    includes: [
      "Every platform: eBay, Poshmark, Mercari, Whatnot, Depop, Etsy, Shopify, Amazon, TikTok Shop, Square",
      "About 600 orders a month (going over never locks anything)",
      "Monthly profit by platform",
      "Year-end inventory at cost",
      "Everything in Side hustle",
    ],
    featured: true,
  },
  {
    key: "business",
    name: "Business",
    monthly: 69,
    annual: 690,
    orders: 2500,
    platforms: "Every platform",
    for: "A reselling business with helpers or a bookkeeper",
    includes: [
      "Every platform",
      "About 2,500 orders a month (going over never locks anything)",
      "Up to 3 extra users (a helper, your bookkeeper or tax preparer)",
      "Everything in Full time",
    ],
  },
];

/** The Free plan's lines on the pricing page (plans.ts "free" features). */
export const FREE_INCLUDES = [
  "1 platform",
  "Up to 25 orders a month",
  "Fees, cost of goods and profit per sale",
  "Mileage and expense logs",
  "Schedule C worksheet",
];

const FAQ_AVAILABLE = {
  q: "Is Seller Books available now?",
  pre: "Not yet. It is in early access: you can join the list and we'll email you when there's an invite for you. Nothing is for sale and we don't take payment details.",
  open: "Yes. Create an account and use it free for one platform and up to 25 orders a month, with every report: profit by platform and month, the stock report and the Schedule C worksheet. No card is asked for.",
};

const FAQ_COST = {
  q: "What does it cost?",
  pre: "The proposed prices are on the pricing page: from $15 a month, depending on how many orders you ship and how many platforms you sell on. They may change before launch, and early-access members will hear about any price before they're asked to pay.",
  open: "The Free plan costs nothing: one platform and up to 25 orders a month. Paid plans start at $15 a month, sized by how many orders you ship and how many platforms you sell on (the pricing page has them); they are not on sale yet, so nothing is charged and no card is asked for.",
  paid: "The Free plan costs nothing: one platform and up to 25 orders a month. Paid plans start at $15 a month, sized by how many orders you ship and how many platforms you sell on; the pricing page has them.",
};

const pick = (item) => {
  const l = launch();
  return { q: item.q, a: !l.open ? item.pre : l.paidOn && item.paid ? item.paid : item.open };
};

/** The questions page, with the availability and price answers for the current launch state. */
export const faqItems = () => [pick(FAQ_AVAILABLE), ...FAQ.slice(0, 7), pick(FAQ_COST), FAQ[7]];

const FAQ = [
  {
    q: "Which platforms does it work with?",
    a: "eBay, Poshmark, Mercari, Whatnot, Depop, Etsy, Shopify, Amazon, TikTok Shop and Square. Sales come in from the reports each platform lets you download (no account connection is needed), and sales with no report are typed in.",
  },
  {
    q: "What about sales I make in person or on Facebook Marketplace?",
    a: "Type them in: the date, what sold, what the buyer paid, and any payment app fee or postage. Pick the item from your stock and its cost moves to cost of goods sold. They count in your profit and in gross receipts on the Schedule C worksheet like your marketplace sales, and booth fees or market rent go in as expenses.",
  },
  {
    q: "Why not just use the fee percentage each platform publishes?",
    a: "Published rates change, differ by category, and leave out things like ads, shipping discounts and refunds. The fees you were actually charged are in your own reports, so that's what Seller Books uses.",
  },
  {
    q: "Is this tax advice?",
    a: "No. Seller Books organises your sales, costs and miles and groups the totals the way Schedule C does. What you deduct and how you file is your decision, or your tax professional's.",
  },
  {
    q: "Do resellers have to pay quarterly estimated taxes?",
    a: "Often, yes. No employer withholds tax from reselling profit, so the IRS generally expects payments on four dates (around April 15, June 15, September 15 and January 15) if you expect to owe $1,000 or more for the year after withholding and credits. Paying at least 100% of last year's tax (110% if last year's AGI was over $150,000), spread over the four dates, generally avoids the underpayment penalty, and sellers whose sales come late in the year can use the annualized method instead. Seller Books shows both from your books; what you pay is your decision or your tax professional's.",
  },
  {
    q: "Will I get a Form 1099-K?",
    a: "Maybe. For federal reporting, a platform sends a 1099-K when your payments in a year are over $20,000 and more than 200 transactions; some states set lower thresholds. Either way, the form is a report of payments, not a tax bill: business income is reportable whether or not you get one, and your fees, cost of goods and other expenses count against it. Having your own books means you can match the form to your records, and Seller Books lays the form's figures beside your books month by month.",
  },
  {
    q: "Do I need Seller Books if I only sell a few things a year?",
    a: "Probably not. Selling your own used things for less than you paid is generally not a profit, and a spreadsheet may be all you need. Seller Books is for people who buy to resell.",
  },
  {
    q: "What happens to my data?",
    a: "Your sales and costs are used to keep your books and nothing else. We don't sell data. For the early-access list we keep your email address, the platforms and order volume you told us, and a hashed (not raw) IP address as a record of consent.",
  },
];

/** Survey options on the early-access form (help set tiers; optional). */
export const VOLUME_BANDS = [
  { value: "lt50", label: "Under 50 orders a month" },
  { value: "50-100", label: "50 to 100" },
  { value: "100-600", label: "100 to 600" },
  { value: "600-2500", label: "600 to 2,500" },
  { value: "gt2500", label: "More than 2,500" },
];
