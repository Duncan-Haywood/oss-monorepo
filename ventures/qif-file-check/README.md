# Qif File Check

Free browser tool that checks a QIF (Quicken Interchange Format) bank or card export before it goes
into Quicken, QuickBooks, Xero, YNAB, GnuCash or Banktivity, and says why an import fails or posts
wrong: no !Type header, a last record with no closing ^, dates whose day/month order the file cannot
prove (or that mix both), amounts written 1.234,56 or (18.00), split lines that do not add up to the
total, and rows downloaded twice (QIF has no transaction ID). It gives a line number for each and
writes a repaired file, optionally with dates rewritten to a four-digit year in the order you
confirm. The file is read locally and never uploaded.

**Live tool:** https://marisstella.app/qif-file-check/

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
cd ventures/qif-file-check && node --test '*.test.mjs'
```

## Known gaps

Re-audited 2026-11-24
([`portfolio/quality/audits/2026-11-24-qif-file-check.json`](../../portfolio/quality/audits/2026-11-24-qif-file-check.json),
re-checking [the 2026-11-13 audit](../../portfolio/quality/audits/2026-11-13-qif-file-check.json)):

- Investment records are checked for structure only: the action (N), the
  security (Y) and a T line on every action that moves cash. The arithmetic
  `T = Q × I ± O` (shares times price, plus or minus commission) is not
  checked, because brokers round price and commission differently and a
  tolerance has not been chosen from real files.
- Two-digit years written with `/` are read with a pivot at 70 (`'69` is
  2069, `/70` is 1970); Quicken's own convention is an apostrophe for
  2000s years, which is read as 20xx regardless.

Fixed since the 2026-11-13 audit: list sections of a full Quicken export
(`!Type:Cat`, `!Account` blocks) are no longer checked as transactions; stray
letters before an amount (`l2.50`, `DR12.50`) are no longer stripped as a
currency code; calendar-impossible dates (02/30/2024) are errors; splits are
compared to the cent; investment share transfers need no T and the security
counts as the description; every date the repair rewrites is listed by line.

## Files

- `index.html`: the tool's page.
- `calc.mjs`: the logic, kept separate from the page so it can be tested.
- `usage.mjs`: anonymous, opt-in-only usage counters (off by default; see
  `portfolio/usage/README.md` in the monorepo).
- `*.test.mjs`: tests for the logic and the page.

## License

FSL-1.1-MIT. See `LICENSE`.

## No warranty

This tool is free and as-is. It is not legal, financial, tax or professional
advice and does not replace a qualified professional. You are responsible for
checking its output before relying on it. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its use.
