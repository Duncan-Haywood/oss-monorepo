# Quickbooks Iif File Check

Free browser tool that checks a QuickBooks Desktop IIF (Intuit Interchange Format) import file
before it goes in, and says why the import fails or posts wrong: a transaction with no ENDTRNS row,
TRNS and SPL amounts that do not sum to zero, a row with more columns than its header (a stray tab),
columns separated by spaces instead of tabs, header columns missing, cells wrapped in Excel quote
marks, dates that are year-first or day-first, unknown account types, accounts used but absent from
the file's own !ACCNT list, and transactions repeated. It gives a line number for each and writes a
repaired file. The file is read locally and never uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/quickbooks-iif-file-check/

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test ventures/quickbooks-iif-file-check/
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
