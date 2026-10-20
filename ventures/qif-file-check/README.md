# Qif File Check

Free browser tool that checks a QIF (Quicken Interchange Format) bank or card export before it goes
into Quicken, QuickBooks, Xero, YNAB, GnuCash or Banktivity, and says why an import fails or posts
wrong: no !Type header, a last record with no closing ^, dates whose day/month order the file cannot
prove (or that mix both), amounts written 1.234,56 or (18.00), split lines that do not add up to the
total, and rows downloaded twice (QIF has no transaction ID). It gives a line number for each and
writes a repaired file, optionally with dates rewritten to a four-digit year in the order you
confirm. The file is read locally and never uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/qif-file-check/

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test ventures/qif-file-check/
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
