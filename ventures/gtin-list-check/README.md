# Gtin List Check

Free browser tool that checks a product list's UPC, EAN, GTIN and ISBN column before it is uploaded
to a marketplace or retailer: wrong check digits (with an adjacent-swap suggestion), leading zeros
lost to Excel (restored only when the check digit agrees), scientific notation like 3.60003E+11
(expanded when provable, flagged as unrecoverable when digits were rounded away), duplicates (a UPC
and its EAN-13 form count as one), blanks, placeholders, GS1 reserved prefixes and ISBN-10s, each
with its line number. An 8-digit UPC-E short code that is not a valid GTIN-8 is expanded to its
UPC-A form when the check digit agrees; one that is valid both ways is kept and warned about. A GTIN-14 case-pack code is linked to the item code it wraps when both are in the list. Zero-width characters, full-width digits, thousands separators and "UPC:"-style labels pasted in with a code are cleaned up the same way, only when the check digit agrees with the result. It writes the file back with those fixes applied. The file is read
locally and never uploaded.

**Live tool:** https://marisstella.app/gtin-list-check/

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test 'ventures/gtin-list-check/*.test.mjs'
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

## Known gaps

From the quality audit of 2026-11-12
([`portfolio/quality/audits/2026-11-12-gtin-list-check.json`](../../portfolio/quality/audits/2026-11-12-gtin-list-check.json))
and its re-audit of 2026-11-24
([`portfolio/quality/audits/2026-11-24-gtin-list-check.json`](../../portfolio/quality/audits/2026-11-24-gtin-list-check.json)).
All nine defects of the first audit are now fixed: scientific notation that lost digits is always
unrecoverable; GTIN-14 prefix rules read the item body, not the indicator digit; an 8-digit code valid
as both a GTIN-8 and a UPC-E is warned about and matched against its UPC-A form; 980 refund receipts
and GTIN-8 codes starting with 0 or 2 (RCN-8) are flagged; decimal-comma scientific notation
(`4,006381333931E+12`) is read; repair writes empty rows and CRLF line endings back as they were.
Still not modelled:

- A check digit catches about 9 in 10 wrong guesses, so a restored leading zero is strong evidence,
  not proof; an 11-digit number that lost a middle digit instead of a leading zero can pass.
- The prefix list is the common GS1 ranges, not the full current GS1 prefix table.
