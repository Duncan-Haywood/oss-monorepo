# Xero Bank Statement Csv Check

Free browser tool that checks a bank statement CSV before it is imported into Xero and says why the
import fails or posts wrong: account details or a title above the header, separate Debit and Credit
columns instead of one signed Amount, amounts written 1.234,56, (18.00) or $12.50, dates whose
day/month order the file cannot prove (or that mix both), rows downloaded twice, two-digit years,
and cells a spreadsheet damaged (scientific notation, #REF!). It gives a line number for each and
writes a repaired CSV in Xero's column layout, optionally with dates rewritten in the format and
order you confirm. The file is read locally and never uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/xero-bank-statement-csv-check/

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test ventures/xero-bank-statement-csv-check/
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
