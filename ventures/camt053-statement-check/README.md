# Camt053 Statement Check

Free browser tool that checks an ISO 20022 camt.053 XML bank statement before it goes into
QuickBooks, Xero, Sage, DATEV, Exact, Moneybird or a spreadsheet, and says why an import fails or
does not reconcile: opening balance plus booked entries that do not equal the closing balance (and
by how much), a statement that does not continue from the previous one, batch entries whose lines do
not add up, declared counts and totals that do not match, missing booking dates, repeats and XML
that is not well formed. It gives a line number for each and converts the entries to CSV. The file
is read locally and never uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/camt053-statement-check/

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test ventures/camt053-statement-check/
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
