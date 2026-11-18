# UK VAT Flat Rate Scheme Calculator

Free, private browser tool for UK VAT-registered small businesses: enter your sector, turnover and what you spend, and see whether the VAT Flat Rate Scheme or standard VAT accounting leaves you with less to pay HMRC, including the 16.5% limited cost trader trap and the 1% first-year discount.

**Live tool:** https://marisstella.app/uk-vat-flat-rate-scheme-calculator/

After using this, you know whether to join (or leave) the Flat Rate Scheme, which used to take an accountant's spreadsheet.

Known gaps (quality audit 2026-11-13, `portfolio/quality/audits/2026-11-13-uk-vat-flat-rate-scheme-calculator.json`): the limited cost trader test runs on annual figures, while HMRC applies it each return period (£250 a quarter); the £230,000 leave limit only appears as a note, so the verdict does not change for a business over it.

Open `index.html`. Tests: `node --test 'ventures/uk-vat-flat-rate-scheme-calculator/**/*.test.mjs'`.

**No warranty.** Free and as-is; not tax advice. Rates must be verified against GOV.UK. See `VENTURE.yaml`.
