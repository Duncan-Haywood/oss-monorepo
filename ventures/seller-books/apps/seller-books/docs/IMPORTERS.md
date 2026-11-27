# Importers: reports, columns and how sure we are

Every importer matches columns **by header name**. Case, spaces, underscores and punctuation are ignored, and
each field accepts several known spellings. Position never matters. The header row may sit below a preamble
(eBay), and footer lines are ignored. A file missing a required column is refused with a 400 that names each
missing field and the spellings accepted for it. A changed export therefore fails loudly instead of importing
wrong numbers.

**Verification status (2026-11-24; Mercari, Whatnot and Etsy's file menus re-checked on official pages 2026-11-26; Shopify added 2026-11-26 from its own column lists; Amazon added 2026-11-26 from no live page, see its section; TikTok Shop added 2026-11-26 from a column dictionary and TikTok's field definitions, see its section; Square added 2026-11-26 from a seller-quoted header row and Square's glossary, see its section; PayPal added 2026-11-27 from PayPal's own field reference, see its section).** This environment could not open the marketplaces' help pages. The column
names below come from search-engine excerpts of those pages, from seller and community posts that quote the
headers, and, where noted, only from the help page's own field descriptions. **No platform's full, ordered
header row was confirmed.** The fixtures in `test/fixtures/` were written to match these names; they are not
real exports. Before launch, download one real export per platform, run it through the importer, and add it
(anonymised) as a fixture. The full research notes are in `RESEARCH-2026-11-24.md`.

## eBay: Transaction report

Seller Hub > Payments > Reports > Transaction report (CSV). One row is one ledger entry.

- **Required:** `Transaction creation date`, `Type`, `Net amount`.
- **Also read:** `Order number`, `Legacy order ID`, `Item title`, `Custom label`, `Quantity`, `Item subtotal`,
  `Shipping and handling`, `Seller collected tax`, `eBay collected tax`, `Final Value Fee - fixed`,
  `Final Value Fee - variable`, `Regulatory operating fee`, `Very high "item not as described" fee`,
  `Below standard performance fee`, `International fee`, `Gross transaction amount`, `Transaction currency`,
  `Item ID`, `Transaction ID`, `Reference ID`, `Description`.
- **Types:**
  - `Order` → sale.
  - `Refund` / `Claim` → refund, net of refunded tax, with fee credits.
  - `Shipping label` → postage charge.
  - `Other fee` → advertising if the description mentions promoted listings, otherwise other.
  - `Payout` / `Transfer` / `Hold` → skipped.
- **Confidence:** the first columns and the fee column names appear in eBay's reconciliation help page and in
  community posts. Exact dash and capitalisation are unconfirmed, and columns are customisable. Fee signs are
  taken by absolute value (charge on orders, credit on refunds).

## Poshmark: My Sales Report

Account > My Sales Report (emailed CSV). One row is one listing sold; a bundle is several rows with the same
order id.

- **Required:** `Order Date`, `Order Price`, `Net Earnings`.
- **Also read:** `Order Id`, `Listing Title`, `Seller Shipping Discount`, `Upgraded Shipping Label Fee`,
  `Texas Seller Fee Tax`, `Sales Tax`, `Order Status`.
- **Fees:** Poshmark's fee is not itemised. It is recorded as `Order Price − discounts − Texas tax − Net Earnings`
  (`marketplace_fee`, labelled derived).
- **Confidence:** Order Price, Net Earnings, Seller Shipping Discount, Texas Seller Fee Tax, Offer/Bundle Order,
  Order date, Order ID and Listing title are named by Poshmark's help article and a seller blog. The column order
  and the other names are unconfirmed.

## Mercari: Gross Sales Report

The Gross Sales Report (CSV, dates `yyyy-mm-dd`), for a date or date range you pick. One row is one item.

- **Required:** `Item Id`, `Sold Date`, `Item Price`, `Net Seller Proceeds`.
- **Also read:** `Completed Date`, `Canceled Date`, `Order Status`, `Item Title`, `Buyer Shipping Fee`,
  `Seller Shipping Fee`, `Mercari Selling Fee`, `Payment Processing Fee`, `Shipping Adjustment Fee`,
  `Sales Tax Charged to Buyer`.
- **Not read, on purpose:** `Shipped to State`, `Shipped from State`, and the four buyer-paid columns
  (`Merchant Fees Charged to Buyer`, `Service Fee Charged to Buyer`, `Buyer Protection Charged to Buyer`,
  `Payment Processing Fee Charged to Buyer`). The buyer pays those; they are not the seller's income or fees,
  and Mercari leaves them out of the 1099-K gross. Headers match exactly, so `Payment Processing Fee Charged
  to Buyer` is never read as the seller's `Payment Processing Fee` (a unit test pins this).
- **Only completed orders are booked.** `Order Status` is Completed, Canceled or In Progress as of the day the
  report is generated. Mercari charges its fees when an order completes and says the costs it shows for orders
  in progress are estimates. A booked sale is never replaced by a later import, so an in-progress row is
  skipped with a reason ("import a later report once it completes") instead of booking an estimate that would
  stay, or a sale a later cancellation would never remove. Without a status column, a blank `Completed Date`
  means not completed and any `Canceled Date` means cancelled.
- **Date:** the sale is booked on `Completed Date`, falling back to `Sold Date` when the report has no
  completed date. Completion is when Mercari adds the net proceeds to the seller's balance, and only completed
  transactions are reported on Mercari's 1099-K, so an item sold on 30 December and completed on 3 January is
  booked in January, the year the 1099-K counts it.
- **Confidence (2026-11-26):** every column name above, with its meaning, is from Mercari's own help article
  ([541](https://www.mercari.com/us/help_center/article/541/), "What information is included in the Gross Sales
  Report", read in a browser on 2026-11-26), and the completed-only and buyer-fee rules from its 1099-K FAQ
  ([163](https://www.mercari.com/us/help_center/article/163/)). The fixture's header is that list in the
  article's order; the order in a real file and the spelling of the status values are still unconfirmed
  (matching is case-insensitive and by name, so neither matters to the importer). Singular and plural fee
  names are still both accepted.
  - Reconciliation check: item − fees − seller-paid shipping = net, which is how article 541 defines
    `Net Seller Proceeds`. A row that doesn't add up gets a warning.
  - The 10% selling fee (item price plus buyer-paid shipping, listings from 6 January 2025) is recorded with
    its quote in `src/shared/reference/fee-sources.ts` for reference; the importer still takes the fee from
    the report's column.

## Whatnot: Seller Weekly Orders Report

Seller Hub > Financials > Statements, one CSV per week (Monday 00:00 to Sunday 23:59 UTC, ready Mondays at
06:00 UTC). One row is one transaction; a refund is a second row with the same `Order ID`, in the week the
refund completed. Only completed transactions are in it: pending, failed-payment and cancelled orders are not.

- **Required:** `Transaction Type`, `Transaction Amount`.
- **Also read:** `Transaction Completed at UTC` (the date), `Order Placed At UTC` (fallback date),
  `Transaction Currency`, `Ledger Transaction ID` (the de-duplication key), `Order ID`, `Shipment ID`,
  `Transaction Message`, `Listing Title`, `Buy Format`, `SKU`, `Quantity Sold`, `Post Coupon Price`,
  `Original Item Price`, `Coupon Cost`, `Shipping Fee`, `Commission Fee`, `Payment Processing Fee`,
  `Tax on Commission`, `Tax on Payment Processing Fee`.
- **Not read, on purpose:** `Buyer Paid` (adds buyer-paid shipping and taxes, which Whatnot collects and
  spends; not the seller's income), `Cost of Goods` (the seller's own optional entry; cost of goods is kept on
  the Inventory page), `Order Refund Shipping Costs`, `Appealed Order Refund` and `Appealed Shipping Refund`
  (the article does not say which rows carry them; `Transaction Amount` already holds what reached the
  balance), and the descriptive columns (show, buyer, category, week number).
- **Types:**
  - `Order Earnings` → sale. Price = `Post Coupon Price` (after the seller's own coupons; commission is
    charged on it), else `Original Item Price − Coupon Cost`. Seller-paid shipping (`Shipping Fee`, giveaway
    shipping included) is postage. Fees: commission, payment processing, and the two taxes on fees as other.
    Net = `Transaction Amount`; a row where price − fees − seller-paid shipping ≠ amount gets a warning.
  - `Tips` → income titled "Tip"; with no price columns, the amount plus any fees on the row.
  - `Order Refund` → refund of the whole `Transaction Amount`, no fee split (the article does not say how it
    divides between item, shipping and fee credits).
  - `Shipping Charge` → postage charge (label adjustments and bring-your-own-label costs, per shipment).
  - Anything else (the ledger's payouts, rewards, ads) → skipped with a reason; those are not in this report.
- **Date:** `Transaction Completed at UTC`, the moment the money reached the balance; Whatnot's monthly
  statements also count a transaction in the month it completed
  ([44413003987981](https://help.whatnot.com/hc/en-us/articles/44413003987981)). It is UTC, and the books keep
  the UTC date, so a sale completed at 02:00 UTC on 1 January (evening of 31 December in the US) is booked in
  January.
- **Currency:** rows not in USD are skipped with a reason.
- **Confidence (2026-11-26):** every column name, type value and meaning above is from Whatnot's own help
  article ([36772664621837](https://help.whatnot.com/hc/en-us/articles/36772664621837-Seller-Weekly-Orders-Report),
  "Metric Definitions", last updated 2026-11-26, read through the help centre's public article API
  `help.whatnot.com/api/v2/help_center/en-us/articles/<id>.json`, since the HTML page answers automated
  readers with 403). The fixture's header is that list in the article's order; the rows are authored. Not yet
  seen in a real file: the timestamp format, whether amounts carry a `$`, and the exact spelling of the type
  values (matching ignores case and punctuation, so `ORDER_EARNINGS` also works). The earlier column list
  (`Sold Price`, `Total Earnings`, `Transaction Date`, 2026-11-24, from a third-party integration) matched none
  of the article's date or amount columns, so a real file would have been refused; those names stay as fallbacks.

## Depop: sales download

Selling Hub > Stats > Download sales (up to 3 months). One row is one sale.

- **Required:** a date (`Date of sale` / `Date`), `Item price`.
- **Also read:** buyer, description, quantity, buyer shipping, label cost, sales tax, `Depop Payments fee`,
  selling fee, boosting fee, refunded amount, total.
- **Confidence:** Depop's help article lists the *contents* (date, buyer, description, quantity, pricing,
  Depop Payments / Buyer Marketplace / Selling / Boosting fees, shipping, tax) but not the header strings. Every
  name here is a best-effort spelling with alternatives. Verify with a real file first.
- **Refunds:** booked on the sale date, because the file has no refund date. A warning says so.

## Etsy: two files

1. **Orders** (Shop Manager > Settings > Options > Download Data > Orders, CSV Type **Orders**, then a month and
   year, or no month for the whole year; `EtsySoldOrders*.csv`). One row is one order. The same dropdown also
   offers Order Items, Etsy Payments sales and Etsy Payments deposits
   ([Etsy help](https://help.etsy.com/hc/en-us/articles/360000343328), read 2026-11-26); pick Orders.
   - **Required:** `Sale Date`, `Order ID`, `Order Value`.
   - **Also read:** `Number of Items`, `Discount Amount`, `Shipping Discount`, `Shipping`, `Sales Tax`,
     `Order Total`, `Currency`, `Status`, `Card Processing Fees`, `Order Net`, `SKU`.
   - **Confidence:** the column list matches a third-party guide that reproduces the header. Sale Date is M/D/YY.
2. **Payment account monthly statement** (Shop Manager > Finances > Monthly statements > View all monthly
   statements, pick the year and month, Generate CSV; Etsy emails a Download Now link when it is ready).
   - **Columns:** `Date, Type, Title, Info, Currency, Amount, Fees & Taxes, Net`, as given by a seller blog.
     Etsy's own help article ([How to Calculate Your Etsy Payments Deposit Amount](https://help.etsy.com/hc/en-us/articles/360016389113),
     read 2026-11-26) confirms an `Info` column (it says when a sale's funds become available) and Fee, Tax,
     Sale and deposit entries, but lists no header row.
   - **Fee rows** → charges, typed by title (transaction, listing, Etsy/Offsite Ads, regulatory, subscription).
   - **Marketing rows** → advertising.
   - **Shipping rows** → postage.
   - **Refund rows** → refunds.
   - **Skipped:** Sale rows (the Orders file has them), Tax rows (collected and remitted by Etsy),
     Deposit/Payment rows, and processing-fee rows (already in the Orders file's Card Processing Fees).

Import both files for the same months. The statement alone has no sales, and the Orders file alone has only
processing fees.

## Shopify: two files

Both column lists come from Shopify's own help pages, read 2026-11-26 through their Markdown copies (the HTML
pages for payouts answer automated readers with a bot check; the `.md` URL beside each one does not). Unlike
the other platforms, **every column name below is Shopify's own documented header**; the fixtures
(`test/fixtures/shopify-*.csv`) are authored to those headers, not real exports.

1. **Orders export** (Orders > Export, any date range, CSV; `orders_export*.csv`;
   [Exporting orders](https://help.shopify.com/en/manual/fulfillment/managing-orders/exporting-orders)). One
   row is one line item: "orders with multiple line items display their additional line items on separate
   lines. Many of the fields are left blank", so the order's totals sit on its first row.
   - **Required:** `Name`, `Created at`, `Total`, `Lineitem quantity`.
   - **Also read:** `Paid at`, `Financial Status`, `Currency`, `Subtotal`, `Shipping`, `Taxes`,
     `Refunded Amount`, `Canceled at`, `Lineitem name`, `Lineitem SKU`, `Id`.
   - **One sale per order**, dated by `Paid at` (or `Created at` when blank). Goods = `Total − Shipping −
     Taxes`, so the figure is right whether `Subtotal` is before or after discounts (the help page does not
     say). Quantity is the sum of the line items; the SKU is kept when the order has one.
   - **Skipped:** financial status `pending`, `authorized`, `voided` or `expired` (no money captured), and
     non-USD orders.
   - **Refunds:** `Refunded Amount` becomes a refund on the order's payment date, with a warning: the export
     has no refund date, and the amount may include refunded tax and shipping.
2. **Shopify Payments transactions** (Finance > Payouts > View transactions > Export, CSV;
   [Transaction CSV file columns](https://help.shopify.com/en/manual/payments/shopify-payments/payouts/view-details#csv-file-columns)).
   One row is one balance transaction. Columns: `Transaction Date, Type, Order, Card Brand, Card Source,
   Payout Status, Payout Date, Payout ID, Available On, Amount, Fee, Net, Checkout, Payment Method Name,
   Presentment Amount, Presentment Currency, Currency`.
   - **Required:** `Transaction Date`, `Type`, `Amount`, `Fee`.
   - **`charge` and `refund` rows** → their `Fee` only, as payment processing (the amounts are in the orders
     export; importing both would double count).
   - **`chargeback`** → a return of the disputed amount; **`chargeback won`** → the same return reversed.
   - **`bill payment` / `bill refund`** → subscription (a Shopify bill paid from the Payments balance).
   - **`adjustment` / `fraud protect adjustment`** → other fees or credits, signed by `Net`. Shopify's CSV uses
     `adjustment` for chargeback fees, fee refunds and Shopify Capital or Credit repayments alike; the import
     warns with the line numbers, since a loan repayment is not a cost.
   - **Skipped:** `reserved_funds`, `marketplace sales tax` (collected and remitted by Shopify),
     `shop_cash_credit` (already in the order's total), `refund_failure`, payouts and transfers, non-USD rows,
     and any type not listed here (named in the skip reason, never guessed).

Import both files for the same months. Sellers paid through PayPal or another gateway have no Shopify
Payments file: their processing fees come from that processor's statement (an expense). Shopify Shipping
labels and the monthly plan are on the Shopify bill, not in either file: add them as expenses, or from the
card statement that paid the bill.

## Amazon: Date Range Report (transaction)

Seller Central > Payments > Reports Repository, report type **Transaction**, a date range, CSV (the older
menu was Reports > Payments > Date Range Reports). Added 2026-11-26. One row is one transaction: an order line
(one SKU of an order), a refund, a service fee, an FBA inventory fee, an adjustment, a transfer. A few lines of
preamble sit above the header ("All amounts in USD, unless specified", then definitions); they are skipped.

**How sure we are: least of all the importers.** Amazon's help pages and every third-party page tried
(sellercentral.amazon.com, sellerlabs.com) were unreachable from the build environment on 2026-11-26. The
names below are the widely quoted US layout of this report as known to the author, not read from a page
that day, and `test/fixtures/amazon-date-range-report.csv` is written to those names, not a real export.
Two safeguards make a wrong guess loud rather than silent: a file without `date/time`, `type` and `total` is
refused with the names expected, and an order or refund row whose columns do not add up to its `total` is
imported with a warning naming the line. **Before launch, run one real export through it.**

- **Required:** `date/time`, `type`, `total`.
- **Also read:** `settlement id`, `order id`, `sku`, `description`, `quantity`, `marketplace`, `fulfillment`,
  `product sales`, `product sales tax`, `shipping credits`, `shipping credits tax`, `gift wrap credits`,
  `giftwrap credits tax`, `Regulatory Fee`, `Tax On Regulatory Fee`, `promotional rebates`,
  `promotional rebates tax`, `marketplace withheld tax`, `selling fees`, `fba fees`, `other transaction fees`,
  `other`. Older spellings accepted: `sales tax collected`, `marketplace facilitator tax`.
- **The sum:** `product sales + shipping credits + gift wrap credits + promotional rebates + the tax columns +
  marketplace withheld tax + selling fees + fba fees + other transaction fees + Regulatory Fee + Tax On
  Regulatory Fee + other = total`. Charges are negative in the report and credits positive; each fee keeps
  its own column's sign (a fee credited back on a refund becomes a negative fee). No rate is applied.
- **Dates:** `date/time` as printed (`Mar 3, 2026 2:14:07 AM PST`), so a sale is on the Pacific-time day
  Amazon shows.
- **Types:**
  - `Order`, `Liquidations` → sale. Goods = `product sales + promotional rebates` (the seller's own
    promotions lower the price); shipping = `shipping credits + gift wrap credits`; sales tax = the four
    tax columns (Amazon collects and remits it; `marketplace withheld tax` takes it back out, so it is never
    income). Fees: `selling fees` → commission (Amazon's referral fee), `fba fees` → fulfillment (FBA),
    `Regulatory Fee` → regulatory, the rest → other.
  - `Refund`, `Chargeback Refund`, `A-to-z Guarantee Claim` → refund of goods and shipping (not the tax), with
    the fees credited back as negative fees (the referral fee less Amazon's refund administration fee, as the
    report nets them).
  - `Service Fee` → by description: `Subscription` → subscription (Schedule C Part V), advertising
    (`Cost of Advertising`, coupons, deals, Vine) → advertising, otherwise other fees.
  - `FBA Inventory Fee`, `FBA Customer Return Fee`, `FBA Transaction fee`, `Inbound Transportation Fee` →
    fulfillment fees. `Deal Fee`, `Coupon Fee` → advertising. `Shipping Services` → postage.
  - `Adjustment`, `Fee Adjustment`, `Liquidations Adjustments`, `Amazon Fees`, `Retrocharge`,
    `Order_Retrocharge`, `SAFE-T reimbursement` → other fees or credits, signed by `total`. Credits
    (an FBA reimbursement for lost stock, a fee refund) lower line 10; the import warns with their count and
    sum, since a preparer may put a stock reimbursement on line 6 and mark the item written off.
  - `Transfer` (payout) and `Debt` (a negative balance charged to the card) → skipped as money movement.
  - Any other type is skipped with its name, never guessed.
- **Other marketplaces:** rows whose `marketplace` is not `amazon.com` are skipped, and a file whose preamble
  names a currency other than USD is refused.
- **Ids:** the report has no transaction id, so each row's id is a hash of its settlement, type, order,
  SKU, date, total and description; identical rows (two equal storage fees) are told apart by their order
  among equals, which is the same on every download of the same range.

## TikTok Shop: statement, Order details sheet

Seller Center > Finances > Statements > Export (a date range), then download from Export history. The file is
an Excel workbook; open it and save its **Order details** sheet as CSV (File > Save As > CSV), then import that.
Added 2026-11-26. One row is one settled order line (`Type` `Order`) or one adjustment with its own type (a
logistics reimbursement, a deduction, an ads charge).

**How sure we are: low, like Depop and Amazon.** TikTok's Seller University page on the settlement report
(knowledge_id 2336057241700098) was found by search but answered 404 to the build environment on 2026-11-26.
Its field definitions, quoted by search, give the sum below and name the fee columns. The header strings come
from an MIT column dictionary of the US 2026 export (github.com/Perufitlife/tiktok-shop-settlement, which says
it cross-checked Seller University and the Finance API) and TikTok's Finance API field names. No real export
was seen; `test/fixtures/tiktok-shop-statement.csv` is written to these names. **Before launch, run one real
export through it.**

- **Required:** `Type`, `Total settlement amount` (or `Settlement amount`).
- **Also read:** `Statement Date`, `Order created date`, `Statement ID`, `Currency`, `Order/adjustment ID`,
  `Related order ID`, `SKU ID` / `Seller SKU`, `Product name`, `Quantity`, `Net sales`, `Gross sales`,
  `Gross sales refund`, `Seller discount`, `Seller discount refund`, `Shipping`, `TikTok Shop shipping fee`,
  `Customer-paid shipping fee`, `Shipping insurance fee`, `Return shipping fee`, `Fees`, `Referral fee`,
  `Transaction fee`, `Refund administration fee`, `Affiliate commission`, `Affiliate partner commission`,
  `Affiliate shop ads commission`, `Adjustment amount`, `Sales tax payment`.
- **The sum** (Seller University): `Total settlement amount = Net sales + Shipping + Fees + Adjustment amount`,
  so in TikTok's own layout costs are negative. Some guides show the same file with costs positive
  (`Net sales - Shipping - Fees + Adjustments`). The importer reads the layout from the file: any negative fee
  or shipping-cost cell means signed, otherwise costs are positive. A row that still does not add up is
  imported as the file shows it, and one warning names up to five such lines.
- **Order rows:** goods = `Gross sales - Seller discount` (or `Net sales` without the gross column); the refund
  on the same row = `Gross sales refund - Seller discount refund`, booked as a separate refund dated on the
  `Statement Date` (the file has no refund date; a warning counts them). The sale is dated `Order created
  date`. Shipping: the buyer paid `Customer-paid shipping fee`; postage is what the `Shipping` subtotal leaves
  after it (or `TikTok Shop shipping fee + Shipping insurance fee + Return shipping fee` without the subtotal).
  Fees: `Referral fee` and `Refund administration fee` → commission, `Transaction fee` → payment processing,
  the three affiliate commissions → advertising (paid to creators, not TikTok). Whatever the itemised
  columns leave of `Fees` (a new fee TikTok added, say) stays a fee, "Fees (not itemised)", so the books still
  match the settlement; with no itemised column it is the combined marketplace fee. `Sales tax payment` is
  collected by TikTok Shop and never income.
- **Other types:** reserve, payout, withdrawal and transfer rows are skipped as money movement. Any other
  non-order type is an adjustment, booked as a charge or credit by `Adjustment amount` (or the total), dated on
  the statement date: shipping and logistics → postage, ads and promotions → advertising, otherwise other fees.
  Credits lower line 10, and the import warns with their count and sum, as for Amazon.
- **Currency:** rows in a currency other than USD are skipped (US shops only).
- **Ids:** a hash of statement id, type, order/adjustment id, SKU and total; identical rows are told apart by
  their order among equals. The same order settled again on a later statement (a refund after settlement) is a
  new row, not a duplicate.
- **Dates:** `2026/03/14`, with or without a time, as well as every format the other importers read.

## Square: Transactions CSV (card reader and market sales)

Square Dashboard > Transactions > pick the date range > Export > Transactions CSV. Added 2026-11-26 for the
sales a reseller rings up at a market, flea market or pop-up on a Square reader or the Square app (cash rung
up in the app is in the same file, with no fee). One row is one payment or one refund (`Event Type`).

**How sure we are: medium on the names, low on the signs.** The full, ordered header row comes from a seller
who pasted it on the Square Community (thread "Improvement: Transactions Report Enhancements", 2023-02-28,
community.squareup.com/t5/Product-Updates/Improvement-Transactions-Report-Enhancements/m-p/639958); it is the
header of `test/fixtures/square-transactions.csv`. The money columns follow Square's own glossary (help
article 5200, read 2026-11-26): "Net total: Total collected minus fees minus other withholdings"; "Fees: The
amount of fees collected at the time of payment processing or service (excludes taxes)"; "Discounts: Pre-tax
discounts applied to a sale". Sellers report `Event Type` holding `Payment` or `Refund`. No real export was
seen, and how Square signs a refund row's amounts is not documented: **before launch, run one real export
through it.**

- **Required:** `Date`, `Event Type`, `Net Total`.
- **Also read:** `Gross Sales`, `Discounts`, `Service Charges`, `Net Sales`, `Gift Card Sales`, `Tax`, `Tip`,
  `Partial Refunds`, `Total Collected`, `Fees`, `Transaction ID`, `Payment ID`, `Description`,
  `Transaction Status`.
- **Payments:** income is `Net Sales` (after discounts; `Gross Sales` less `Discounts` without it, or what
  `Total Collected` leaves after tax, tips, service charges and gift cards) plus `Tip` and `Service Charges`,
  which are gross receipts too (a warning counts the tips). `Tax` is the sales tax the seller collected and
  must send to the state: kept out of income, like Shopify's. `Fees` → payment processing. `Net Total` is not
  stored as the report's net, because it includes that tax; instead a payment whose parts do not add up to it
  (sales + tips + service charges + tax + gift cards − fees) is named in a warning.
- **Gift cards:** `Gift Card Sales` are left out of income (the money is owed to the card's holder until the
  card is spent; the spend is a later payment's sales). A payment for a gift card alone books only its fee,
  as a charge.
- **Refunds:** each `Refund` row is a refund dated on its own date: the goods, tips and service charges given
  back, never the tax. A fee on a refund row is read as Square giving the fee back (a credit) when the file's
  fees are signed (a payment with a negative `Fees`, as Square exports them); in a file with every cost
  positive it cannot be told apart from a charge, so it is left out with a warning. A payment showing
  `Partial Refunds` is warned about, since the refund comes from its own row and the date range must include it.
- **Skipped:** a `Transaction Status` containing failed, canceled, declined, voided or pending; any event type
  other than payment or refund; amounts in a currency other than dollars (the amount does not parse).
- **Ids:** `Transaction ID`, `Payment ID` and the event type (a hash of the row without them). Two refunds of
  one payment are told apart by amount, then by their order among equals, so the same file again adds nothing.

## PayPal: Activity download (sales paid by PayPal off the marketplaces)

paypal.com > Activity > Statements > Activity download, CSV, for up to 12 months at a time. Added 2026-11-27
for the sales a reseller is paid for in PayPal without a marketplace payout behind them: a local pickup or a
Facebook Marketplace or Instagram sale paid by PayPal goods and services, or a site whose buyers pay into the
seller's PayPal account. Until then these had to be typed in one at a time as direct sales. One row is one
balance entry.

**How sure we are: high on the names and meanings, medium on the `Type` labels, low on the signs of refund
fees.** Every column name and its meaning comes from PayPal's own field reference, "Activity Download report"
(developer.paypal.com/reports/activity-download, read 2026-11-27): `Gross` is "the localized gross amount of
the transaction, including fees", `Fee` "the localized fee amount that is associated with the transaction",
`Balance Impact` "`Debit`, `Credit`, or `Memo`", `Status` one of `Completed`, `Denied`, `Reversed`, `Pending`
and others, and `Type` "the transaction event code (T-code) description" (the list at
developer.paypal.com/reports/reference/t-codes, read the same day). The fixture
`test/fixtures/paypal-activity-download.csv` uses the reference's column order with the default columns; it is
not a real export, and how the CSV spells each T-code description (for example "Express Checkout Payment" for
T0006, "Express Checkout payment" in the reference) is not confirmed, so types are matched by words, not
exact labels. A Tiller community thread reports downloads with `Amount` in place of `Gross`; both are accepted.
**Before launch, run one real download through it.**

- **Required:** `Date`, `Type`, `Status`, `Gross` (or `Amount`).
- **Also read:** `Fee`, `Net`, `Currency`, `Name` (only to spot marketplace payouts, never stored),
  `Transaction ID`, `Reference Txn ID`, `Item Title`, `Subject`, `Quantity`, `Shipping and Handling Amount`,
  `Insurance Amount`, `Sales Tax`, `Balance Impact`.
- **Payments received** (a type naming a payment, checkout or purchase, credited): a sale. Item income is
  `Gross` less shipping and handling, insurance and sales tax; shipping and insurance are shipping charged;
  `Sales Tax` is kept out of income. `Fee` → payment processing. `Net` is not stored as the report's net,
  because it includes the tax. The title is `Item Title`, else the payer's `Subject`. A warning says that every
  payment received is counted as a sale, so money from friends, a loan repaid or a personal item sold at a loss
  must be left out or deleted afterwards: PayPal's file cannot tell them apart.
- **Marketplace payouts:** a payment whose `Name` is eBay, Poshmark, Mercari, Whatnot, Depop, Etsy, Shopify,
  Amazon, TikTok or Square is skipped (and so is a refund of it), with a warning to import that platform's own
  report, so its sales are not counted twice.
- **Refunds** (refund, reversal or chargeback, debited): a refund of `Gross` less its sales tax, dated on its
  own date, with `Fee` read as PayPal signs it (positive on a refund = fee given back). A refund whose
  `Reference Txn ID` is a payment left out (not completed, a marketplace payout) is left out too; one whose
  payment is not in the file is imported, with a warning to check the sale is in the books.
- **Fee rows** (a type naming a fee: a chargeback or dispute fee, a fee reversal): an account-level charge
  (`other` for chargeback and dispute fees, else payment processing), negative when PayPal gave it back. A fee
  row for a payment whose own `Fee` cell already holds a fee is skipped, so a fee is never counted twice.
- **Skipped, each with its reason:** a status other than `Completed`; `Memo` rows; holds, releases, reserves
  and authorisations; withdrawals, transfers, deposits and currency conversions (money between the seller's
  own accounts); payments the seller sent (a warning totals them: stock goes in Inventory, supplies and
  postage in Expenses); refunds and reversals credited to the seller; rows in a currency other than USD
  (counted in a warning); anything else, with its type named.
- **Ids:** `Transaction ID` (PayPal's unique 17-character id), or a hash of the date, type, amounts and name
  without one, so the same file again adds nothing.

## Your own sourcing sheet (inventory, not a marketplace report)

`POST /api/orgs/:orgId/inventory/items/import`, on the Inventory page. Not a platform export: the columns are
whatever the seller typed, so the header names accepted are the common ones (the same list the public
`ventures/reseller-books/inventory.mjs` reads): date bought (`Date Bought`, `Purchase Date`, `Sourced`...),
cost (`Unit Cost`, `Cost`, `Price Paid`... or a row total: `Total Cost`, `Lot Cost`...), item (`Item`,
`Title`, `Name`...) or `SKU`/`Custom label`, and optionally `Qty`, `Status`, `Date Removed`. Fixture:
`test/fixtures/sourcing-sheet.csv` (authored, covers every skip reason).

## A bank or card statement (expenses, not sales)

`POST /api/orgs/:orgId/expenses/statement` reads the file and answers candidate rows (nothing is written, the
file is not stored); `POST /api/orgs/:orgId/expenses/batch` saves the rows the seller ticked on the Expenses
page. Parser: `src/worker/services/importers/statement.ts`; merchant rules:
`src/worker/services/importers/statement-rules.ts`. Added 2026-11-26.

- **Columns.** A date (`Transaction Date` is preferred over `Post Date` when both are there, then `Date`,
  `Posted Date`...), a description (`Description`, `Merchant`, `Payee`, `Name`...), and either one signed
  `Amount` or separate `Debit`/`Credit` (`Withdrawals`/`Deposits`, `Money Out`/`Money In`) columns. A
  `Category` column from the bank is shown as a hint; a `Type` column (`Sale`, `Return`, `Payment`, `Debit`,
  `Credit`, `DR`, `CR`) decides money out from money in.
- **Sign.** Issuers differ: some card exports print purchases negative, others positive. With no `Type` or
  debit/credit split, the sign most rows carry is taken as money out (a statement is mostly purchases), the
  page says so, and one click reads it the other way round.
- **Money in** (refunds, deposits, card payments) is left out with its line number; a refund of a business
  purchase is entered net by hand. An unreadable amount or date skips the row with its line; nothing is guessed.
- **Suggestions.** Postage bought directly (USPS, UPS, FedEx, Pirate Ship...), packaging suppliers (Uline,
  Staples...), listing and design software (Vendoo, List Perfectly, Canva...), ads and storage units start
  ticked with a category. Thrift, bins and liquidation buys (inventory: add them under Inventory so their cost
  reaches Part III when the item sells), marketplace charges (already in that platform's report), fuel (the
  standard mileage rate covers it: the IRS allows the standard rate or actual car costs, not both,
  Publication 463 ch. 4), phone and internet (business share only), general stores (Amazon, Walmart...) and
  transfers start unticked with the reason. Unknown merchants start unticked as "other". Keywords match whole
  words, so `BP` is not `BPS`.
- **The seller's own choices** (added 2026-11-26, `statement-memory.ts`). Before the rules above, each line is
  matched against the expenses already in the shop's books, statement imports and hand-typed ones alike. A
  merchant is keyed by the first two words of its description left after dropping processor prefixes
  (`SQ`, `TST`, `PAYPAL`, `POS`...) and any word containing a digit, so `SQ *CORNER CAFE 0412` and
  `Corner Cafe` are both `CORNER CAFE`; a one-word vendor typed by hand (`USPS`) also teaches longer lines
  (`USPS PO ...`). The latest choice by date wins (a seller who moved a merchant meant to), from the shop's
  5,000 latest expenses with a vendor. A learned merchant takes that category and starts ticked, with "You
  filed N earlier charges from X as Y" shown; a store that sells everything and a payment or transfer get
  the category but stay unticked, since those need a decision per line. Only the shop's own books teach it.
  Lines the seller left unticked are not stored unless the seller asks (next item).
- **Merchants the seller leaves out** (added 2026-11-26, `statement-memory.ts`, `left_out_merchant`, migration
  0004). When the seller unticks a line that started ticked, the page offers "Remember the lines I unticked"
  (ticked by default, shown only when there is such a line). On save, each of those lines is keyed as above and
  only the key, a count and the latest statement date are kept. The next statement starts that merchant
  unticked with "You left out N earlier charges from X (latest D)". The latest decision wins: an expense filed
  from the merchant on or after that date keeps it ticked, and filing one from a statement forgets the
  merchant. Lines the rules already start unticked (inventory, marketplace charges, fuel, stores that sell
  everything, transfers, lines no rule knows) are not sent, since their own reason already leaves them out.
  The Expenses page lists the remembered merchants with a "Forget" button (`GET` and
  `DELETE /api/orgs/:orgId/expenses/left-out[/:merchant]`; viewers read, editors forget). A save may carry
  only remembered merchants and no expenses.
- **Re-imports.** A row is already in the books when an expense has the same date, amount and vendor
  (case-insensitive), counted per key: two identical $12.40 USPS charges on one day are two expenses.
- **Limits.** 5 MB, 2,000 rows per file.

**Verification.** The three layouts were written from how the issuers' downloads are commonly described, not
from a real downloaded file: `test/fixtures/statement-*.csv` are authored. Before launch, run one real export
each from a Chase card, a Capital One card, an Amex card and a checking account through the preview and add
them anonymised as fixtures.

## A mileage tracker's trip export (mileage, not sales)

Mileage page > "Import trips from a mileage tracker" (`services/importers/mileage.ts`,
`POST /mileage/import/preview` then `POST /mileage/import`, added 2026-11-26). For sellers whose phone app
already records their drives (MileIQ, Stride, Everlance, TripLog, Driversnote) or who keep a spreadsheet.

- **Required:** a date (`Date`, `Start date`/`START_DATE`, `Started at`, `Trip date`, ...) and a distance:
  `Miles`, `Distance`, `Miles driven`, `Total miles`, ..., or a kilometre column (`km`, `Distance (km)`,
  `Kilometers`), converted at 1.609344 km per mile. A `Unit` column saying km converts a `Distance` column.
- **Also read:** classification (`Classification`, `Category`, `Type`, `Trip type`), purpose (`Purpose`,
  `Business purpose`, `Description`, `Reason`), notes (`Notes`, `Memo`, `Comment`), start (`Start`, `From`,
  `Start location`, `Origin`) and end (`Stop`, `End`, `To`, `End location`, `Destination`).
- **Business or not:** a classification of business/work is imported. Personal, commute, charity, medical,
  moving and unclassified trips are left out with the reason (charity and medical miles belong on
  Schedule A, not C). A `Purpose` cell holding only one of those words (Everlance's "Work"/"Personal") is
  read as the classification, and the notes become the purpose. A file with no classification at all lists
  every trip, with a warning to untick the personal ones.
- **Purpose:** the IRS log needs a business purpose per trip, so a trip with none waits on the page until
  one is typed (one box fills every empty one). The server refuses a trip with an empty purpose.
- **Re-import:** a trip with the same date, miles (to 0.1) and start and end (case-insensitive) is already
  in the log; counted per key, so two identical post office runs on one day stay two trips. Imported trips
  are one leg each (`roundTrip` false), as trackers record them.
- Rows with no readable date (a `TOTAL` footer), no distance, an unreadable distance or over 5,000 miles
  are left out with the line number. Up to 2,000 trips per file.
- **Confidence: lowest of the importers' headers.** On 2026-11-26 no tracker's help page listing its CSV
  header row was found. MileIQ's help pages describe the report's contents (dates and times,
  classification and purpose, start and stop locations, miles, value, parking, tolls); a QuickBooks
  community thread quotes a MileIQ-related layout `START_DATE, END_DATE, CATEGORY, START, STOP, MILES,
  MILES_VALUE, PARKING, TOLLS, TOTAL, VEHICLE`, which `test/fixtures/mileage-mileiq-style.csv` follows.
  Everlance's help centre names "Purpose" as the work/personal field, with from/to locations, miles and
  notes (`mileage-everlance-style.csv`). Stride's says only that its mileage report is a CSV, and
  Everlance notes Stride's has no from/to addresses. The fixtures are written to those descriptions, not
  real exports. Before launch, run one real export from each app through the preview and add it
  (anonymised) as a fixture; the page shows which header each field was read from.
