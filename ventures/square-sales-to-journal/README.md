# Square Sales To Journal

Free browser tool that turns a Square Transactions CSV into balanced monthly accounting journals for
Xero, QuickBooks Online and QuickBooks Desktop (IIF). It checks every payment (Total Collected plus
Fees equals Net Total), books gross sales, discounts, sales tax and tips (as liabilities, not
income), gift card sales, refunds and Square processing fees separately instead of the net deposit,
writes one journal per calendar month balanced to a Square clearing account, totals each Deposit ID
so it can be matched to the bank feed, and can prove a month against a Net Total typed in from
Square. Money no column explains is journalled to an uncategorised account rather than dropped. The
file is read locally and never uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/square-sales-to-journal/

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test ventures/square-sales-to-journal/
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
