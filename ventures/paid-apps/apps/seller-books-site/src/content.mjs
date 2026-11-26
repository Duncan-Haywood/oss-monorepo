// Single source of the site's words: product name, platforms, pricing tiers, FAQ. build.mjs renders
// every page, sitemap.xml, robots.txt and llms.txt from this file, and the tests read it, so a fact
// lives in one place.
//
// Copy rules (docs/PRICING.md, README.md): early access, nothing is sold yet; no testimonials, no
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

export const TAGLINE = "True profit and Schedule C books for resellers";

export const SUMMARY =
  "Seller Books is bookkeeping for people who resell on eBay, Poshmark, Mercari, Whatnot, Depop and Etsy. It brings your sales from every platform into one ledger, takes out the fees each platform actually charged, matches what you paid for each item, logs your sourcing miles, and builds a Schedule C worksheet you or your tax preparer can work from. It is in early access: nothing is for sale yet.";

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
];

/** What the product does (home page "What it does" and llms.txt). Future tense: it's being built. */
export const FEATURES = [
  {
    key: "profit",
    title: "True profit per sale, across every platform",
    body: "One ledger for eBay, Poshmark, Mercari, Whatnot, Depop and Etsy. Each sale shows what the buyer paid, every fee the platform took, shipping you paid, and what the item cost you, so the number at the bottom is profit, not payout.",
  },
  {
    key: "fees",
    title: "Fees from your own reports, not a rate table",
    body: "Platform fees change often and differ by category. Seller Books reads the fees you were actually charged from each platform's sales and payout reports, so the books match what landed in your bank account.",
  },
  {
    key: "cogs",
    title: "Cost of goods that follows the item",
    body: "Record what you paid when you source, including bulk lots and bins split across the items in them. When an item sells, on whichever platform, its cost moves to cost of goods sold; what's unsold stays as inventory at the end of the year.",
  },
  {
    key: "mileage",
    title: "Sourcing miles",
    body: "Log trips to thrift stores, estate sales and the post office with date, purpose and miles. The worksheet shows them with the IRS standard mileage rate for the trip's date, or keeps them as a record if you use actual car expenses instead.",
  },
  {
    key: "schedule-c",
    title: "A Schedule C worksheet",
    body: "At year end you get your totals grouped the way Schedule C (Form 1040) asks for them: gross receipts, returns, cost of goods sold with beginning and ending inventory, car and truck, commissions and fees, supplies and other expenses. A worksheet for you or your tax preparer, not a filed return.",
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
];

/**
 * Proposed tiers (docs/PRICING.md has the reasoning). Nothing is charged during early access.
 * `orders` = orders per month across all platforms, the main value and cost driver.
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
      "Up to 100 orders a month",
      "Fees, cost of goods and profit per sale",
      "Mileage log",
      "Year-end Schedule C worksheet",
    ],
  },
  {
    key: "fulltime",
    name: "Full time",
    monthly: 35,
    annual: 350,
    orders: 600,
    platforms: "All 6 platforms",
    for: "Reselling is your main work and you crosslist",
    includes: [
      "Up to 600 orders a month",
      "Everything in Side hustle",
      "Bulk lots split across items",
      "Inventory at year end (what's unsold, at cost)",
      "Monthly profit by platform",
      "Export for your tax preparer (CSV)",
    ],
    featured: true,
  },
  {
    key: "business",
    name: "Business",
    monthly: 69,
    annual: 690,
    orders: 2500,
    platforms: "All 6 platforms",
    for: "A reselling business with helpers or a bookkeeper",
    includes: [
      "Up to 2,500 orders a month",
      "Everything in Full time",
      "Up to 3 extra users (a helper, your bookkeeper or tax preparer)",
      "Quarterly profit summaries for estimated-tax planning",
      "Inventory aging (what's been sitting longest)",
    ],
  },
];

export const FAQ = [
  {
    q: "Is Seller Books available now?",
    a: "Not yet. It is in early access: you can join the list and we'll email you when there's an invite for you. Nothing is for sale and we don't take payment details.",
  },
  {
    q: "Which platforms will it work with?",
    a: "eBay, Poshmark, Mercari, Whatnot, Depop and Etsy. Sales come in from the reports each platform lets you download, and through a direct connection where a platform offers one.",
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
    q: "Will I get a Form 1099-K?",
    a: "Maybe. For federal reporting, a platform sends a 1099-K when your payments in a year are over $20,000 and more than 200 transactions; some states set lower thresholds. Either way, the form is a report of payments, not a tax bill: business income is reportable whether or not you get one, and your fees, cost of goods and other expenses count against it. Having your own books means you can match the form to your records.",
  },
  {
    q: "Do I need Seller Books if I only sell a few things a year?",
    a: "Probably not. Selling your own used things for less than you paid is generally not a profit, and a spreadsheet may be all you need. Seller Books is for people who buy to resell.",
  },
  {
    q: "What will it cost?",
    a: "The proposed prices are on the pricing page: from $15 a month, depending on how many orders you ship and how many platforms you sell on. They may change before launch, and early-access members will hear about any price before they're asked to pay.",
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
