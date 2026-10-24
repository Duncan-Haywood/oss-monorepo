# CSV to SEPA Direct Debit File (pain.008)

Free browser tool that turns a CSV or Excel export of collections (debtor, IBAN, amount, mandate id,
mandate date) into a SEPA direct debit file (ISO 20022 `pain.008.001.02`, Core or B2B) for your business
bank's upload. Your creditor identifier gets its check-digit test, every IBAN the mod-97 and country-length
check, amounts are read as exact cents (`34,50` and `1,200.50` both work; an ambiguous `1,234` is refused),
rows are grouped into the FRST / RCUR / FNAL / OOFF blocks banks require, and no file is written while any
collection has an error. The list is read locally and never uploaded.

**Live tool:** https://duncan-haywood.github.io/oss-monorepo/csv-to-sepa-pain008/

## Why use it

Today a club or small business either pays for the direct-debit module of an accounting or membership package,
keys collections into the bank's web form one at a time, or uploads the member list to a web converter. This
tool is free, private (nothing leaves the browser tab), refuses to emit a half-correct batch, and explains each
problem per line, including the mandate rules that make a bank reject a first file.

## Run it

Open `index.html` in a browser. There is no build step, no account and no API key.

```
node --test ventures/csv-to-sepa-pain008/*.test.mjs
```

Columns are found from the header: debtor/name, IBAN, amount, mandate id, mandate date, and optionally
reference, sequence (FRST/RCUR/FNAL/OOFF or first/recurring/final/one-off), BIC and id. With no header the
order is name, IBAN, amount, mandate id, mandate date, reference, sequence.

## Files

- `index.html`: the tool's page.
- `calc.mjs`: the logic (`convert`, `checkCreditorId`, `checkIban`, `parseCents`, `buildXml`), kept separate from the page so it can be tested.
- `usage.mjs`: anonymous, opt-in-only usage counters (off by default; see `portfolio/usage/README.md` in the monorepo).
- `*.test.mjs`: tests for the logic and the page. When the sibling `sepa-pain001-validator` is present, a test checks that this tool's output passes it.

Sibling: [`csv-to-sepa-pain001`](../csv-to-sepa-pain001/) makes credit transfer files.

## License

MIT. See `LICENSE`.

## No warranty

This tool is free and as-is. It is not legal, financial, tax or professional advice and does not replace a
qualified professional. You are responsible for holding a signed mandate for every collection, sending debtors
their pre-notification, and checking the output before relying on it; your bank remains the final validator. To
the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.
