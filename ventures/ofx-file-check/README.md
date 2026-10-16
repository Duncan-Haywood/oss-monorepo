# Ofx File Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/ofx-file-check/>

Free browser tool that checks an OFX or QFX bank or credit-card export (the "Web Connect" file
imported into QuickBooks, Quicken, YNAB and Xero) for what makes the import fail: header lines,
unclosed tags, missing TRNTYPE, DTPOSTED, TRNAMT or FITID, invalid dates and amounts, duplicate
FITIDs, statement dates that do not cover the transactions, blank account fields, unescaped
ampersands and over-long names, each with its line number. It writes the file back with every
provable fix applied and shows a plain diff of what changed. The file is read locally and never
uploaded.

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test ventures/ofx-file-check/
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
