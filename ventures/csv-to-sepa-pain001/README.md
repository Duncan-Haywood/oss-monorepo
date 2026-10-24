# CSV to SEPA Payment File (pain.001)

Free browser tool that turns a CSV or Excel export of payments (payee, IBAN, amount, reference) into a
SEPA credit transfer file (ISO 20022 `pain.001.001.03` or `.09`) for your business bank's bulk upload.
Every IBAN gets the mod-97 and country-length check, amounts are read as exact cents (`1.200,50` and
`1,200.50` both work; an ambiguous `1,234` is refused), names and references are made SEPA-safe,
duplicates and weekend or past execution dates are flagged, and no file is written while any payment
has an error. The list is read locally and never uploaded.

**Live tool:** https://duncan-haywood.github.io/oss-monorepo/csv-to-sepa-pain001/

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test ventures/csv-to-sepa-pain001/
```

## Files

- `index.html`: the tool's page.
- `calc.mjs`: the logic (`convert`, `parseCents`, `checkIban`, `buildXml`), kept separate from the page so it can be tested.
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
