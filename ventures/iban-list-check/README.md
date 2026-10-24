# Iban List Check

Free browser tool that checks a supplier, payroll or refund list's IBAN column before the payment
file is uploaded to a bank: wrong ISO 13616 mod-97 check digits (with an adjacent-swap suggestion
when exactly one swap proves it), wrong length for the country, unknown countries, spaces / lower
case / labels from copy-paste (cleaned when provably harmless), duplicates and blanks, each with its
line number. It writes the file back cleaned, optionally in print groups of four. The file is read
locally and never uploaded.

**Live tool:** https://duncan-haywood.github.io/oss-monorepo/iban-list-check/

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

`cli.mjs` is the same checker for a terminal or a CI job, with no
dependencies and no network calls. Before a payment run:

```
node cli.mjs check suppliers.csv                  # exit 1 if any IBAN is invalid
node cli.mjs check exports/ --strict --sepa-only  # every .csv/.tsv/.txt under a folder; duplicates, blanks and non-SEPA fail too
node cli.mjs check suppliers.csv --column iban --json
node cli.mjs fix suppliers.csv                    # writes suppliers.fixed.csv (--in-place overwrites, --groups prints in fours)
```

Exit codes: 0 clean, 1 findings at the failing level, 2 usage or read error.

To run the tests (Node 20 or newer):

```
node --test ventures/iban-list-check/
```

## Files

- `index.html`: the tool's page.
- `calc.mjs`: the logic, kept separate from the page so it can be tested.
- `cli.mjs`: the command-line and CI wrapper around `calc.mjs`.
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
