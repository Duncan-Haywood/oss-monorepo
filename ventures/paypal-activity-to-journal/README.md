# Paypal Activity To Journal

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/paypal-activity-to-journal/>

Free browser tool that turns a PayPal Activity download (CSV) into balanced accounting journals for
Xero, QuickBooks Online and QuickBooks Desktop (IIF). It walks the running Balance column row by row
to prove no transaction is missing or out of order (naming the row where the chain breaks), books
the gross payment to sales and the fee to PayPal fees so refunds and disputes come out right, groups
chargebacks and holds, payments sent, bank transfers and currency conversion, and splits at month
end into one journal per month per currency, each balanced to a PayPal account line. Rows no rule
recognises are journalled to an uncategorised account rather than dropped. The file is read locally
and never uploaded.

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test ventures/paypal-activity-to-journal/
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
