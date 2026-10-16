# Meta Catalog Csv Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/meta-catalog-csv-check/>

Free browser tool that checks a Meta (Facebook and Instagram) catalog feed (CSV or TSV) before it is
uploaded to Commerce Manager: semicolon or UTF-16 files, missing required columns, duplicate or
damaged ids, prices without an ISO currency or written with a symbol or decimal comma, sale prices
not below the price or in another currency, availability and condition values, empty or http product
links, WebP and SVG images, GTIN check digits and Excel-damaged barcodes, titles in capitals or
carrying promotional text, and item-group variants with identical options, each with its line
number, plus a safe-fixes pass that converts the delimiter, spells availability as Meta expects and
restores a barcode's leading zeros only when the check digit confirms them. The file is read locally
and never uploaded.

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test ventures/meta-catalog-csv-check/
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
