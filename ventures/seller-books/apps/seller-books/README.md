# Seller Books

Profit and Schedule C books for resellers on eBay, Poshmark, Mercari, Whatnot, Depop, Etsy, Shopify,
Amazon (FBA or shipped yourself), TikTok Shop, Square (a card reader or the Square app at a market or flea
market, from its Transactions CSV), PayPal (sales paid by PayPal off the marketplaces, from its Activity
download) Venmo (a local or Facebook Marketplace sale paid by Venmo, from its monthly statement CSV) and Cash App (the same, from its activity CSV); Grailed,
StockX, Vinted, Reverb and any other marketplace import from their own CSV with the seller matching its columns once
(the choices are saved for the next file); plus the sales made off them (cash at a market or flea market, Facebook
Marketplace, a local pickup paid by Zelle), which are typed in one at a time. You import the
marketplaces' own reports, track cost of goods per item and per lot, and log mileage (typed in, or read from
a mileage tracker app's CSV export). The app then shows
profit by platform and month, a stock report (how long unsold items have sat, sell-through, days to sell by
platform, whether each lot has paid for itself, and profit and return on cost by where items were bought, and a "price an item" table that turns what each platform actually took from the seller's own orders into what an item nets there and the price that clears a target profit) and builds a Schedule C **worksheet** (not a filing, not tax advice),
line 30 included when the seller saves the space they use at home (the simplified method: inventory stored at
home is the usual reseller case). The quarterly estimates page turns the
profit to each Form 2210 period's end into what to have paid by each 1040-ES due date, by the regular and
the annualized (Schedule AI) methods (an estimate, not tax advice); the owner's own figures there (wages,
last year's tax, the payments sent) are saved to the shop for its owner and admins. An owner or admin can ask for a
reminder email a week before each due date, carrying what is still to pay by then; a date already covered
sends nothing, and each email has a one-click stop link.
Each expense can carry its receipts (up to five photos or PDFs, 10 MB each, kept in the app's database; a file whose first
bytes are not what its name says is refused), downloaded from the expense's row and, for a year, in the year-end ZIP's `receipts/`
folder, each named by the expense's date, vendor and amount (`src/shared/receipts.ts`, `services/books/receipts.ts`).
Expenses can be typed in or read from a bank or card statement CSV, each line with a suggested category and
the ones that are really inventory, marketplace fees or fuel left unticked with the reason; a merchant filed
before starts with the seller's own latest category.
The deposits on a bank statement can be checked against the payouts the books expect ("Did I import everything?" on
the Imports page): each deposit that names a platform is set against that platform's sales and shipping, less refunds,
fees and postage, month by month, so a month whose report was never imported shows up as deposits with no sales
behind them; matched deposits are listed and any that is not a payout (a refund of a purchase) can be unticked. The
statement is read on the server and not saved (`src/shared/reconcile-payouts.ts`).
A platform's Form 1099-K can be checked against the books: box 1a (and the monthly boxes) next to the books'
item sales, with and without shipping and the sales tax the platform collected, and the months that do not
match named (nothing typed is saved).
A refunded item that came back goes back in stock from the refund's row, at its cost and dated the return,
without counting as a purchase or changing the year it first sold; the refund's month then shows that cost
coming back in the P&L, the sales ledger and the QuickBooks journal.
Sales tax is never income, and the books say who collected it (`src/shared/sales-tax.ts`): the
marketplaces (eBay, Poshmark, Mercari, Whatnot, Depop, Etsy, Amazon, TikTok Shop) send their sales' tax on
themselves, while the tax on sales the seller rang up (Square, PayPal and Venmo payments, their own Shopify store, a
direct sale typed in with its tax) is theirs to report. The P&L page lists that second part as "Sales tax you
collected", by month and channel with quarter totals and the tax handed back on refunds (Square's refund
rows, direct refunds), and downloads it as `GET .../reports/sales-tax.csv?from&to` to fill a sales tax return
from. Shopify's orders export has one Taxes column, so tax on Shop-channel orders (which Shopify collects)
is in it and the report says to take those out. Nothing decides what a state taxes.
A sales ledger CSV lists every sale, refund and fee behind those figures, one row each, for the seller's records or
their accountant.
The same rows also download as QuickBooks Online journal entries: one balanced summary entry per platform
per month, income and fees on their own accounts and the net on a clearing account per platform, ready for
QuickBooks' journal-entry import.
Shop settings holds the shop's name, a download of every record the shop holds as one JSON file (imports, sales
and fees, charges, inventory, mileage, expenses, home office, filed inventory and the members; owner and admins),
and deleting the shop (the owner, by typing its name; refused while a paid plan is still set to renew, so a
deleted shop is never billed again).
The worksheet also downloads as a PDF, laid out by Schedule C part with the shop's name on it, to print or hand over.
One download, "Everything for your preparer", puts the worksheet, the year's sales ledger, the three year-end
lists below, the QuickBooks journal and the year's receipt files in a single ZIP, with a README that says what each file is and which line it
totals to. Three year-end lists sit beside the worksheet, each totalling to its own figure: the closing inventory on
December 31 at cost (Part III line 41), the mileage log with each trip's date, purpose and miles (the business
miles, and each trip's IRS standard mileage rate on its date, totalling to line 9), and every expense with the
line it lands on. Line 9 prices each trip at the IRS business rate in force on the day it was driven (2022 and
2026 changed on July 1); a rate the seller types in replaces it for every trip.
Equipment the seller keeps and uses (a camera, label printer, shelving, a laptop) has its own expense category:
$2,500 or less an item lands on line 27a under the de minimis safe harbor, with a reminder of the election
statement the return needs, and anything over it goes through Form 4562: the worksheet works out line 13
from the choice saved on each item (bonus depreciation by default, at 100% after January 19, 2025 and the
phase-down rate before; section 179, held to the shop's profit; or no bonus), the 5- or 7-year MACRS class
(half-year or mid-quarter) and the business-use share, carries it into the later years and counts it in lines 28
to 31 (`src/worker/services/books/depreciation.ts`). A large office or supplies expense that may be equipment is
flagged.

Paid plans follow the state automatic-renewal laws a consumer buyer brings (Colorado C.R.S. 6-1-732,
California's ARL): the renewal terms beside every checkout button and a consent tick the server records,
a one-step "Cancel subscription" on the Billing page, and an email to the owner and admins 26 to 39 days
before each yearly renewal (once a year on a monthly plan); see docs/BILLING.md, "Automatic renewal".

Read `docs/ARCHITECTURE.md` first. `docs/IMPORTERS.md` lists every supported report and how well its columns are
verified.

```bash
pnpm typecheck && pnpm test:unit && pnpm test:worker && pnpm build
```

## Tests

- `pnpm test:unit` (importers, lots, P&L and worksheet arithmetic) and `pnpm test:worker` (every route in
  workerd, cross-tenant checks included).
- `pnpm test:e2e` runs the browser suite in `test/e2e` (Playwright, Chromium) against the real Worker and
  SPA, offline: a fresh local D1 in `.wrangler/e2e` from the committed migrations, `FAKE_EXTERNALS=true`
  (the signed fake billing provider, mail to an in-memory fake). About 60 s for fifteen specs:
  1. sign-up, a lot with its cost spread over items, the two Etsy reports, an expense and a round trip,
     then the P&L tiles and the Schedule C lines, held to the figures `test/worker/books.test.ts` checks;
  2. the Free plan refusing a second platform, the fake checkout, and the second import once a signed
     webhook confirms the subscription (the spec reads the pending checkout id from the local D1);
  3. two shops in two browsers: every read and write of the other shop's books answers 404;
  4. no shop page wider than a 390 px phone;
  5. invitations: the Free plan refusing one with the reason, a viewer link once Business is confirmed,
     another address refused, the invitee signing up from the link and joining, reading but not writing,
     the link working once, and removal closing the shop to them;
  6. the account-email pages: a password reset from the link (token read from the local D1, as the
     unopenable fake mailbox would have carried it), used once, the old password and the other device's
     session refused; and the confirmation link (signed as Better Auth signs it with the e2e secret)
     confirming the address, a damaged one explained;
  7. the inventory sourcing-sheet import: preview writes nothing and lists skipped lines, the import
     links an earlier Etsy order by SKU, and the same sheet again adds nothing;
  8. expenses from a card statement: suggestions, one line ticked by hand, save, and a re-read that marks
     every saved line as already in the books;
  9. a Poshmark 1099-K checked against the books: a matching box 1a, then a form with a March the books
     lack, named as the month to import;
  10. a home office saved for the year: line 30's arithmetic, held to line 29 with the reason, still there
     after a reload, and removed again.
  11. trips from a mileage tracker's export: business drives listed and the rest left out with the reason,
     missing purposes filled, saved, and every trip marked as already in the log on a second read.
  12. a direct sale typed in, and last year's filed line 41 as line 35 (two specs numbered 12).
  13. a refunded item that came back: "Item came back?" on the refund puts it back in stock, line 41 counts
     it, line 36 leaves it out of purchases, and undo takes it out again.

  14. shop settings: the owner downloads the JSON export (the direct sale in it), then deletes the shop by
     typing its name and lands on the shop list with it gone.
  16. another marketplace's file matched by hand: the column suggestions, the import as Grailed, and the
     saved columns offered for the second file, which adds nothing.

  17. a receipt kept with an expense: attached as a PDF, counted on the row, downloaded byte for byte, a renamed
     web page refused with the reason, and deleted.

  `scripts/e2e-run.sh <spec> -g <name>` runs one; `E2E_SERVER_LOGS=1` shows the server's output. CI runs
  it as the `e2e` job of `seller-books-ci`. It uses the preinstalled `/opt/pw-browsers` Chromium when
  there is one and never downloads browsers itself.

```bash
echo "AUTH_SECRET=$(openssl rand -hex 32)" > .dev.vars
pnpm db:migrate:local
pnpm dev   # http://localhost:5173
```

Status: v0.1, live on the Free plan since 2026-11-27, deployed on every merge to `main` that touches the venture ([docs/DEPLOY.md](docs/DEPLOY.md)). Paid plans are built and dark until the owner sets the Paddle secrets
([docs/BILLING.md](docs/BILLING.md)). Account email (verification, password reset) and its setup: [docs/EMAIL.md](docs/EMAIL.md). See "Gaps / next" in the architecture doc before launch.
