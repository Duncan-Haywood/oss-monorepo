# CSV to SEPA Direct Debit File (pain.008)

Free browser tool that turns a CSV or Excel export of debtors and signed mandates (name, IBAN, amount,
mandate reference, mandate date) into a SEPA direct debit collection file (ISO 20022 `pain.008.001.02`) for
your business bank's bulk upload. Your creditor identifier gets its check-digit test, every IBAN is checked,
each mandate needs a reference and a signature date, collections are grouped into one block per sequence type
(FRST, RCUR, OOFF, FNAL), and no file is written while any collection has an error. The list is read locally
and never uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/csv-to-sepa-pain008/

Its sibling [`csv-to-sepa-pain001`](../csv-to-sepa-pain001/) makes credit transfer (payment) files.

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test ventures/csv-to-sepa-pain008/
```

## Files

- `index.html`: the tool's page.
- `calc.mjs`: the logic (`convert`, `checkCreditorId`, `parseDate`, `buildXml`), kept separate from the page so it can be tested.
- `usage.mjs`: anonymous, opt-in-only usage counters (off by default; see
  `portfolio/usage/README.md` in the monorepo).
- `*.test.mjs`: tests for the logic and the page. When the sibling `sepa-pain001-validator` is present, a test
  checks that this tool's output passes it.

## License

MIT. See `LICENSE`.

## No warranty

This tool is free and as-is. It is not legal, financial, tax or professional
advice and does not replace a qualified professional. You are responsible for
checking its output before relying on it, and your bank remains the final validator. To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.
