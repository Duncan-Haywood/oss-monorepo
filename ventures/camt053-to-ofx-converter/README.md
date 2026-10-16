# Camt053 To Ofx Converter

Free browser tool that converts an ISO 20022 camt.053 (XML) or SWIFT MT940 bank statement into the
import files accounting software accepts: OFX/QBO for QuickBooks and Quicken, QIF, and Xero's
statement CSV. It checks the statement first (opening balance plus booked entries must equal the
closing balance, naming the amount it is off by), writes a stable transaction ID per entry so re-
importing the same statement does not double-post, and writes one file per statement and account.
The file is read locally and never uploaded; account numbers are masked in the output unless you
choose otherwise.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/camt053-to-ofx-converter/

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test ventures/camt053-to-ofx-converter/
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
