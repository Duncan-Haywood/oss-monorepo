# Stripe Payout To Journal

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/stripe-payout-to-journal/>

Free browser tool that turns a Stripe payout reconciliation report (or balance-transactions export)
into balanced accounting journals for Xero, QuickBooks Online and QuickBooks Desktop (IIF). It
proves each payout's rows add up to the payout (from the payout row, or a deposit typed in from the
bank), books gross sales, Stripe fees, refunds, disputes and adjustments separately instead of the
net deposit, splits a payout that straddles a month end into one journal per month, and balances
each to a Stripe clearing account. Rows no rule recognises are journalled to an uncategorised
account rather than dropped. The report is read locally and never uploaded.

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test ventures/stripe-payout-to-journal/
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
