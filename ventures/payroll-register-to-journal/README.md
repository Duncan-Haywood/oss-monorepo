# Payroll Register To Journal

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/payroll-register-to-journal/>

Free browser tool that turns a payroll register CSV (Gusto, ADP, Paychex, QuickBooks Payroll or a
spreadsheet) into balanced accounting journals for Xero, QuickBooks Online and QuickBooks Desktop
(IIF). It checks every employee row (gross pay less every withholding equals net pay), books gross
wages and the employer's Social Security, Medicare, FUTA, SUTA and retirement match as expenses,
books every withholding as its own liability instead of one net-pay withdrawal, writes one journal
per pay date or month balanced to a payroll clearing account, totals the Form 941 deposit each run
creates, and can prove a run against the net pay typed in from the bank. Money no column explains is
journalled to an uncategorised account rather than dropped, and unknown tax columns are reported.
The file is read locally and never uploaded; employee names are never written into a journal.

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test ventures/payroll-register-to-journal/
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
