# Iban List Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/iban-list-check/>

Free browser tool that checks a supplier, payroll or refund list's IBAN column before the payment
file is uploaded to a bank: wrong ISO 13616 mod-97 check digits (with an adjacent-swap suggestion
when exactly one swap proves it), wrong length for the country, unknown countries, spaces / lower
case / labels from copy-paste (cleaned when provably harmless), duplicates and blanks, each with its
line number. It writes the file back cleaned, optionally in print groups of four. The file is read
locally and never uploaded.

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test ventures/iban-list-check/
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
