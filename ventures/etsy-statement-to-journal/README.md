# Etsy Statement To Journal

Free browser tool that turns an Etsy Payment account statement CSV into balanced monthly accounting
journals for Xero, QuickBooks Online and QuickBooks Desktop (IIF). It checks every row (amount plus
fees and taxes equals net), books gross sales, listing and transaction fees, ads, shipping labels,
refunds and bank deposits separately instead of the net deposit, writes one journal per calendar
month balanced to an Etsy clearing account, and can prove a month against a net total typed in from
Etsy. Rows no rule recognises are journalled to an uncategorised account rather than dropped. The
statement is read locally and never uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/etsy-statement-to-journal/

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test ventures/etsy-statement-to-journal/
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
