# Gumroad Sales To Journal

Free browser tool that turns a Gumroad sales export into balanced accounting journals for Xero,
QuickBooks Online and QuickBooks Desktop (IIF). It splits every sale into product sales, shipping
income, tax collected and Gumroad's fee, books refunds separately instead of the net payout, proves
the rows add up to the payout (from a payout row, a payout ID column, or a deposit typed in from the
bank), splits a payout that straddles a month end into one journal per month, and balances each to a
Gumroad clearing account. Differences no rule explains are journalled to an uncategorised account
rather than dropped. The export is read locally and never uploaded.

**Live tool:** https://marisstella.app/gumroad-sales-to-journal/

## Known gaps

From the 2026-11-20 census audit
([`portfolio/quality/audits/2026-11-20-gumroad-sales-to-journal.json`](../../portfolio/quality/audits/2026-11-20-gumroad-sales-to-journal.json)):
before that round the tool rejected both real Gumroad exports (`Sale Price ($)` was not a known
column) and counted shipping twice. Real headers are now read from Gumroad's own export code
(github.com/antiwork/gumroad), with tests built from those header lists. Still open:

- The Sales export does not say whether Gumroad kept part of its fee on a refund; the tool assumes a
  full refund returns the fee and a partial refund returns none, and says so on each row. The payout
  CSV states the fee and is exact.
- Affiliate credits, fee credits, PayPal and Stripe Connect payout deductions and technical
  adjustments in the payout CSV are booked to the uncategorised account with a note, not classified.
- The built-in sample's fees are not all Gumroad's 10% + 50c.
- No real export file was tested end to end.

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test ventures/gumroad-sales-to-journal/
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
