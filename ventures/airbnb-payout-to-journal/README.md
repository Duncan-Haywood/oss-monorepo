# Airbnb Payout To Journal

Free browser tool that turns an Airbnb host Transaction history CSV into balanced accounting
journals for Xero, QuickBooks Online and QuickBooks Desktop (IIF). It splits every reservation into
rental income, cleaning-fee income and Airbnb's host service fee, books cancellations, resolution
adjustments and co-host payouts on their own lines, books Pass Through Tax as an occupancy tax
liability, compares the rows with the payouts stated in the file (timing differences are explained,
not hidden), writes one journal per calendar month on a cash (paid) or stay (check-in) basis
balanced to an Airbnb clearing account, and journals anything no rule explains to an uncategorised
account rather than dropping it. The file is read locally and never uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/airbnb-payout-to-journal/

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test ventures/airbnb-payout-to-journal/
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
