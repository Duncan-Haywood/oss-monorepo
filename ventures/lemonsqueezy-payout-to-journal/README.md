# Lemon Squeezy Payout To Journal

Free browser tool that turns Lemon Squeezy's **Orders export** into balanced accounting journals for
Xero, QuickBooks Online and QuickBooks Desktop (IIF). It reads the export's amounts as USD cents,
splits every order into product sales, discounts and Lemon Squeezy's fee, reverses refunded orders,
leaves out the tax Lemon Squeezy remits as merchant of record, books a payout fee you enter, checks the
total against the deposit your bank received, splits a payout that straddles a month end into one
journal per month, and balances each to a Lemon Squeezy clearing account. Differences no rule explains
are journalled to an uncategorised account rather than dropped. The export is read locally and never
uploaded.

**Live tool:** https://marisstella.app/lemonsqueezy-payout-to-journal/

## How it reads the export

- Columns, per Lemon Squeezy's exporting-orders help page (cited by the 2026-11-13 audit): `identifier`,
  `order_number`, `product_name`, `variant_name`, `status`, `subtotal`, `discount_total`, `tax`,
  `total`, `tax_name`, `tax_rate`, `date_utc`, in USD cents (`2000` = $20.00). Whole numbers are read
  as cents; a value with a decimal point is read as dollars and warned about.
- **The fee is an estimate.** The export has no fee, net or payout column, so each fee is 5% + 50¢ of
  the order total (Lemon Squeezy's published rate) plus a surcharge percentage you enter: +1.5% for
  buyers outside the US, +1.5% PayPal, +0.5% subscriptions. The docs' worked example ($20 + 20% VAT,
  France, card: fee $2.06, net $17.94) is a test. The deposit check is what proves the estimate: if it
  does not agree, check the Lemon Squeezy payout statement before posting.
- Net per order = total − tax − fee − refund. `refunded` reverses the revenue before tax and keeps the
  fee (an assumption, stated on the page); `pending`, `failed` and `void` orders are skipped; a partial
  refund needs a refunded amount column.
- A CSV you build with per-order subtotal, fee and net columns in dollars still works (with optional
  discount, shipping, tax, refunded and payout ID columns).

## Known gaps

Re-audited 2026-11-24 ([`portfolio/quality/audits/2026-11-24-lemonsqueezy-payout-to-journal.json`](../../portfolio/quality/audits/2026-11-24-lemonsqueezy-payout-to-journal.json),
first audit [`2026-11-13`](../../portfolio/quality/audits/2026-11-13-lemonsqueezy-payout-to-journal.json)):

- No real Lemon Squeezy export was available; the column list is from the help page as the earlier
  audit fetched it. A column the page does not list (a payout reference, a country) is ignored.
- Per-order surcharges are one percentage for the whole file: a mix of US and non-US buyers will not
  agree to the cent without editing. Lemon Squeezy's rounding of each fee is not published; half-cents
  round to the nearest cent.
- Orders are not assigned to payouts by the 1st/15th schedule and its hold; export one payout's orders.

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
cd ventures/lemonsqueezy-payout-to-journal && node --test '*.test.mjs'
```

## Files

- `index.html`: the tool's page.
- `calc.mjs`: the logic, kept separate from the page so it can be tested.
- `usage.mjs`: anonymous, opt-in-only usage counters (off by default; see
  `portfolio/usage/README.md` in the monorepo).
- `*.test.mjs`: tests for the logic and the page.

## License

FSL-1.1-MIT. See `LICENSE`.

## No warranty

This tool is free and as-is. It is not legal, financial, tax or professional
advice and does not replace a qualified professional. You are responsible for
checking its output before relying on it. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its use.
