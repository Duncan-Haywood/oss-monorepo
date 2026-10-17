# Mt940 Statement Check

Free browser tool that checks a SWIFT MT940 bank statement before it goes into QuickBooks, Xero,
Sage, DATEV, Exact, Moneybird or a spreadsheet, and says why an import fails or posts wrong: opening
balance plus transactions that do not equal the closing balance (and by how much), a statement that
does not continue from the previous one, unreadable :61: lines, period decimals, transactions with
no :86: description, repeats, and a missing closing - line. It gives a line number for each, writes
a repaired MT940, and converts the transactions to CSV with the :86: text split into name and
purpose. The file is read locally and never uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/mt940-statement-check/

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test ventures/mt940-statement-check/
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
