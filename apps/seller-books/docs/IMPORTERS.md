# Importers: reports, columns and how sure we are

Every importer matches columns **by header name**. Case, spaces, underscores and punctuation are ignored, and
each field accepts several known spellings. Position never matters. The header row may sit below a preamble
(eBay), and footer lines are ignored. A file missing a required column is refused with a 400 that names each
missing field and the spellings accepted for it. A changed export therefore fails loudly instead of importing
wrong numbers.

**Verification status (2026-11-24).** This environment could not open the marketplaces' help pages. The column
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

## Mercari: sales report

Sales > Download sales report (CSV, dates `yyyy-mm-dd`). One row is one item.

- **Required:** `Item Id`, `Sold Date`, `Item Price`, `Net Seller Proceeds`.
- **Also read:** `Completed Date`, `Order Status`, `Item Title`, `Buyer Shipping Fee`, `Seller Shipping Fee`,
  `Mercari Selling Fee`, `Payment Processing Fee`, `Shipping Adjustment Fee`, `Sales Tax Charged to Buyer`.
- **Confidence:** Item ID, Sold Date, Completed Date, Order Status, Net Seller Proceeds, Sales Tax Charged to Buyer
  and Buyer Protection Charged to Buyer are defined on Mercari's help page (article 541). The price, shipping and
  fee columns come from third-party guides, and singular/plural varies, so both spellings are accepted.
  - Reconciliation check: item − fees − seller-paid shipping = net. A row that doesn't add up gets a warning.

## Whatnot: Seller weekly orders report

Seller Hub. One row is one transaction; a refund is a second row with the same order id.

- **Required:** `Order ID`, a date (`Transaction Date` / `Order Date`), a price (`Sold Price` / `Item Price` / `Subtotal`).
- **Also read:** `Transaction Type`, `Product Name`, `SKU`, `Quantity`, `Shipping Charge`, `Sales Tax`,
  `Commission Fee`, `Tax On Commission Fee`, `Payment Processing Fee`, `Total Earnings`.
- **Confidence:** Whatnot's help article names Commission Fee, Shipping Charge, SKU and Buyer State. A
  third-party integration reports UPPER_SNAKE headers (`TRANSACTION_TYPE`, `ORDER_ID`, `TAX_ON_COMMISSION_FEE`).
  Both forms match because underscores are ignored. The weakest of the six: verify with a real file first.

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

1. **Orders** (Shop Manager > Settings > Options > Download Data > Orders, `EtsySoldOrders*.csv`). One row is
   one order.
   - **Required:** `Sale Date`, `Order ID`, `Order Value`.
   - **Also read:** `Number of Items`, `Discount Amount`, `Shipping Discount`, `Shipping`, `Sales Tax`,
     `Order Total`, `Currency`, `Status`, `Card Processing Fees`, `Order Net`, `SKU`.
   - **Confidence:** the column list matches a third-party guide that reproduces the header. Sale Date is M/D/YY.
2. **Payment account monthly statement** (Finances > Payment account > Download CSV).
   - **Columns:** `Date, Type, Title, Info, Currency, Amount, Fees & Taxes, Net`, as given by a seller blog.
   - **Fee rows** → charges, typed by title (transaction, listing, Etsy/Offsite Ads, regulatory, subscription).
   - **Marketing rows** → advertising.
   - **Shipping rows** → postage.
   - **Refund rows** → refunds.
   - **Skipped:** Sale rows (the Orders file has them), Tax rows (collected and remitted by Etsy),
     Deposit/Payment rows, and processing-fee rows (already in the Orders file's Card Processing Fees).

Import both files for the same months. The statement alone has no sales, and the Orders file alone has only
processing fees.

## Your own sourcing sheet (inventory, not a marketplace report)

`POST /api/orgs/:orgId/inventory/items/import`, on the Inventory page. Not a platform export: the columns are
whatever the seller typed, so the header names accepted are the common ones (the same list the public
`ventures/reseller-books/inventory.mjs` reads): date bought (`Date Bought`, `Purchase Date`, `Sourced`...),
cost (`Unit Cost`, `Cost`, `Price Paid`... or a row total: `Total Cost`, `Lot Cost`...), item (`Item`,
`Title`, `Name`...) or `SKU`/`Custom label`, and optionally `Qty`, `Status`, `Date Removed`. Fixture:
`test/fixtures/sourcing-sheet.csv` (authored, covers every skip reason).
