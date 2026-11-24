# Square Sales To Journal

Free browser tool that turns a Square Transactions CSV into balanced monthly accounting journals for
Xero, QuickBooks Online and QuickBooks Desktop (IIF). It checks every payment (Total Collected plus
Fees equals Net Total), books gross sales, discounts, sales tax and tips (as liabilities, not
income), gift card sales, refunds and Square processing fees separately instead of the net deposit,
writes one journal per calendar month balanced to a Square clearing account, totals each Deposit ID
so it can be matched to the bank feed, and can prove a month against a Net Total typed in from
Square. Cash, Square gift card and other-tender payments (the Cash, Square Gift Card and Other Tender
columns) are debited to Cash on Hand, Gift Cards Outstanding and Other Tender Clearing, so Square
clearing and the Deposit ID totals hold only what Square deposits. Partial refunds are booked as one
amount: the sales tax inside a refund is not split out of Sales Tax Payable (Square's export does not
separate it), so adjust the payable by hand. Money no column explains is journalled to an uncategorised account rather than dropped. The
file is read locally and never uploaded.

**Live tool:** https://marisstella.app/square-sales-to-journal/

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

FSL-1.1-MIT. See `LICENSE`.

## No warranty

This tool is free and as-is. It is not legal, financial, tax or professional
advice and does not replace a qualified professional. You are responsible for
checking its output before relying on it. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its use.
