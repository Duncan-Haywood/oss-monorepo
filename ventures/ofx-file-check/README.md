# Ofx File Check

Free browser tool that checks an OFX or QFX bank or credit-card export (the "Web Connect" file
imported into QuickBooks, Quicken, YNAB and Xero) for what makes the import fail: header lines,
unclosed tags, missing TRNTYPE, DTPOSTED, TRNAMT or FITID, invalid dates and amounts, duplicate
FITIDs, statement dates that do not cover the transactions, blank account fields, unescaped
ampersands and over-long names, each with its line number. It writes the file back with every
provable fix applied and shows a plain diff of what changed. The file is read locally and never
uploaded.

**Live tool:** https://marisstella.app/ofx-file-check/

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test ventures/ofx-file-check/
```

## Command line (whole folders, CI)

```
node cli.mjs check downloads/            # every .ofx/.qfx under the folder; exit 1 on errors
node cli.mjs check downloads/ --json     # or --csv; --strict makes warnings fail too
node cli.mjs fix statement.qfx --diff    # writes statement.fixed.qfx, never overwrites
```

Zero dependencies, Node 20+, no network: files are read locally only.

## Files

- `index.html`: the tool's page.
- `cli.mjs`: command-line checker/fixer for folders and CI.
- `calc.mjs`: the logic, kept separate from the page so it can be tested.
- `usage.mjs`: anonymous, opt-in-only usage counters (off by default; see
  `portfolio/usage/README.md` in the monorepo).
- `export-differential.mjs`: a round-trip harness for the portfolio's OFX and
  QIF writers. It draws random transactions, writes them as bank CSV, BAI2 and
  camt.053, runs each converter (`bank-csv-to-qbo-converter`,
  `bai2-to-ofx-converter`, `camt053-to-ofx-converter`), and checks that this
  tool, `qif-file-check` and `ai-bookkeeper`'s readers get the same dates,
  amounts and payees back, with no error and no field past OFX's length
  limits. `node export-differential.mjs [seed] [amp,accent,long,...|all] [cases]`.
- `*.test.mjs`: tests for the logic and the page.

NAME and MEMO lengths are counted with each escape read once (`AT&amp;T` is
four characters), as OFX 2's schema counts them: NAME is `GenericNameType`
with `maxLength` 32, and an XML Schema facet applies to the parsed value.

## License

FSL-1.1-MIT. See `LICENSE`.

## No warranty

This tool is free and as-is. It is not legal, financial, tax or professional
advice and does not replace a qualified professional. You are responsible for
checking its output before relying on it. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its use.
