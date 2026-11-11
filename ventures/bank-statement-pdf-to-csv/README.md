# Bank Statement Pdf To Csv

Free browser tool that converts a text-based bank or credit card statement PDF into CSV for Xero,
QuickBooks Online or a spreadsheet, and proves the result against the statement itself: opening
balance plus every row must equal the closing balance, each row is checked against the printed
running balance, and a gap is reported with its amount, the line where the balance first breaks, and
the likeliest cause (a missing row, a row on the wrong side, a flipped sign). The PDF is read
locally and never uploaded.

**Live tool:** https://marisstella.app/bank-statement-pdf-to-csv/

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test ventures/bank-statement-pdf-to-csv/
```

## Measured on statements from elsewhere

`eval/README.md` has the method and every number. On the five published
statements of an independent, MIT-licensed statement-parsing benchmark (US
card, Singapore, Netherlands in Dutch, Hong Kong with two accounts, Canada in
French) the reader went from 1 of 5 to 5 of 5 read to the right row count and
proved by the statement's own balances. On two statement PDFs from other
open-source parsers, run afterwards, it first failed both; with two more
layouts (the date printed once per day, one-decimal amounts) it matches 100 of
100 and 56 of 62 rows on date and signed amount, and flags the second as not
adding up. None of these is a real customer's statement.

What the reader handles now: month names and balance labels in English,
French, Dutch, German, Spanish, Italian and Portuguese; amounts like
`1,234.56`, `1.234,56`, `1 234,56 $` and (when a statement prints them)
`1935.3`; WinAnsi `€`; several accounts in one PDF, each proved by its own
running balance and printed totals, with an Account column or one account per
Xero/QuickBooks file; bank or card detected from the statement; rows that share
the date above; footers, watermarks and later tables kept out of the rows.

## Files

- `index.html`: the tool's page.
- `calc.mjs`: the logic, kept separate from the page so it can be tested.
- `usage.mjs`: anonymous, opt-in-only usage counters (off by default; see
  `portfolio/usage/README.md` in the monorepo).
- `*.test.mjs`: tests for the logic and the page (`layouts.test.mjs` rebuilds each
  benchmark layout from synthetic lines).
- `eval/`: `bench.mjs`, `score.mjs` and `dump.mjs` for measuring the reader on
  outside PDFs (none committed); results in `eval/README.md`.

## License

MIT. See `LICENSE`.

## No warranty

This tool is free and as-is. It is not legal, financial, tax or professional
advice and does not replace a qualified professional. You are responsible for
checking its output before relying on it. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its use.
