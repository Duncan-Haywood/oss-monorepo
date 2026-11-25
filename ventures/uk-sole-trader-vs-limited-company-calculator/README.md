# UK sole trader vs limited company calculator (2026/27)

After using this, a UK freelancer or small-business owner can see what they would keep from the same profit as a sole trader or through a limited company paying itself the best salary and dividends, which used to mean an accountant's call or a spreadsheet of stale rates.

**Live tool:** https://marisstella.app/uk-sole-trader-vs-limited-company-calculator/

Static browser tool: `index.html` + `calc.mjs`. Nothing is uploaded. England, Wales and Northern Ireland rates for 2026/27 (dividend tax 10.75% / 35.75% / 39.35%, employer NI 15% over £5,000, Class 4 NI 6% / 2%, corporation tax with marginal relief). Scottish income tax bands, student loans and pension contributions are not modelled. The page tells you to confirm rates on GOV.UK.

```
node --test 'ventures/uk-sole-trader-vs-limited-company-calculator/**/*.test.mjs'
```

Free and FSL-1.1-MIT-licensed; GitHub Sponsors is optional. Not tax advice.

## Known gaps

From quality round 106 ([audit](../../portfolio/quality/audits/2026-11-23-uk-sole-trader-vs-limited-company-calculator.json)). Fixed in that round: the director's personal allowance now tapers on salary plus dividends, and the lower earnings limit is 2026/27's £6,708. Still open:

- The Making Tax Digital finding triggers on profit; the real test is gross qualifying income, which the page does not ask for.
- The Employment Allowance is credited in full and associated companies are not modelled.
- No test pins the dividend additional-rate threshold or employee NI above the upper earnings limit (both seeded bugs survived).
