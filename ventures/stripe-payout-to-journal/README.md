# Stripe Payout To Journal

Free browser tool that turns a Stripe payout reconciliation report (or balance-transactions export)
into balanced accounting journals for Xero, QuickBooks Online and QuickBooks Desktop (IIF). It
proves each payout's rows add up to the payout (from the payout row, or a deposit typed in from the
bank), books gross sales, Stripe fees, refunds, disputes and adjustments separately instead of the
net deposit, splits a payout that straddles a month end into one journal per month, and balances
each to a Stripe clearing account. Rows no rule recognises are journalled to an uncategorised
account rather than dropped. The report is read locally and never uploaded.

**Live tool:** https://marisstella.app/stripe-payout-to-journal/

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
cd ventures/stripe-payout-to-journal && node --test '*.test.mjs'
```

## Files

- `index.html`: the tool's page.
- `calc.mjs`: the logic, kept separate from the page so it can be tested.
- `usage.mjs`: anonymous, opt-in-only usage counters (off by default; see
  `portfolio/usage/README.md` in the monorepo).
- `*.test.mjs`: tests for the logic and the page.

## License

MIT. See `LICENSE`.

## No warranty

This tool is free and as-is. It is not legal, financial, tax or professional
advice and does not replace a qualified professional. You are responsible for
checking its output before relying on it. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its use.

## Known gaps (quality audit 2026-11-13)

From [`portfolio/quality/audits/2026-11-13-stripe-payout-to-journal.json`](../../portfolio/quality/audits/2026-11-13-stripe-payout-to-journal.json). Fixed the same day: the "Deposit in your bank" box read `1,234.56` as 1.23 (here and in `sales-export-to-journal`), and the page now says Xero imports by account code. Still open:

- A `payout_reversal` (a failed payout returned to the balance) is booked to Stripe Adjustments; it belongs against Stripe clearing, or the clearing account is overstated by the failed amount while the reconciliation still agrees.
- The default account names are longer than Xero's 10-character account codes, so the Xero file needs codes typed into the mapping before it imports.
- `reserve_hold`/`reserve_release` are not Stripe reporting categories (Stripe uses `risk_reserved_funds`, `connect_reserved_funds`), and `application_fee` matches the fee pattern though it is a platform's income.
- A QuickBooks JournalNo built from a full payout ID can exceed 21 characters.
- Five seeded bugs survived the tests (refund_failure, payout_reversal, the mixed-currency warning, the month-end date rule, the several-payouts expected-deposit guard).
- Nothing has been checked against a real Stripe export or a live Xero or QuickBooks import.
