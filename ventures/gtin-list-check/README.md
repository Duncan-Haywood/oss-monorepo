# Gtin List Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/gtin-list-check/>

Free browser tool that checks a product list's UPC, EAN, GTIN and ISBN column before it is uploaded
to a marketplace or retailer: wrong check digits (with an adjacent-swap suggestion), leading zeros
lost to Excel (restored only when the check digit proves it), scientific notation like 3.60003E+11
(expanded when provable, flagged as unrecoverable when digits were rounded away), duplicates (a UPC
and its EAN-13 form count as one), blanks, placeholders, GS1 reserved prefixes and ISBN-10s, each
with its line number. It writes the file back with every provable fix applied. The file is read
locally and never uploaded.

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test ventures/gtin-list-check/
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
