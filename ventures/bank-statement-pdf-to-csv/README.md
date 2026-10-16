# Bank Statement Pdf To Csv

Free browser tool that converts a text-based bank or credit card statement PDF into CSV for Xero,
QuickBooks Online or a spreadsheet, and proves the result against the statement itself: opening
balance plus every row must equal the closing balance, each row is checked against the printed
running balance, and a gap is reported with its amount, the line where the balance first breaks, and
the likeliest cause (a missing row, a row on the wrong side, a flipped sign). The PDF is read
locally and never uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/bank-statement-pdf-to-csv/

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test ventures/bank-statement-pdf-to-csv/
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
