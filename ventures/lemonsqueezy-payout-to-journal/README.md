# Lemonsqueezy Payout To Journal

Free browser tool that turns a Lemon Squeezy earnings export into balanced accounting journals for
Xero, QuickBooks Online and QuickBooks Desktop (IIF). It splits every order into product sales
income, shipping income, tax collected and Lemon Squeezy's fee, books refunds separately instead of
the net payout, proves the rows add up to the payout (from a payout row, a payout ID column, or a
deposit typed in from the bank), splits a payout that straddles a month end into one journal per
month, and balances each to a Lemon Squeezy clearing account. Differences no rule explains are
journalled to an uncategorised account rather than dropped. The export is read locally and never
uploaded.

**Live tool:** https://marisstella.app/lemonsqueezy-payout-to-journal/

## Known gaps

Found by the quality audit of 2026-11-13
([`portfolio/quality/audits/2026-11-13-lemonsqueezy-payout-to-journal.json`](../../portfolio/quality/audits/2026-11-13-lemonsqueezy-payout-to-journal.json)):

- The parser was adapted from the Patreon tool and does not read Lemon Squeezy's documented Orders
  export (docs.lemonsqueezy.com/help/orders/exporting-orders): that file has amounts in USD cents and
  no fee, net or payout columns, so it is refused. A CSV with per-order subtotal, fee and net columns
  in dollars works.
- Lemon Squeezy is the merchant of record, so the seller does not collect sales tax; the tax line
  only matters for files that carry one.
- Not modelled yet: fees derived from the published 5% + 50¢ rate and its surcharges, discounts
  (`discount_total`), payout fees (non-US bank, PayPal), and the payout schedule and hold.

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test ventures/lemonsqueezy-payout-to-journal/
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
