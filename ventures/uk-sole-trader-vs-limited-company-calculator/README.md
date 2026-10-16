# UK sole trader vs limited company calculator (2026/27)

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/uk-sole-trader-vs-limited-company-calculator/>

After using this, a UK freelancer or small-business owner can see what they would keep from the same profit as a sole trader or through a limited company paying itself the best salary and dividends, which used to mean an accountant's call or a spreadsheet of stale rates.

Static browser tool: `index.html` + `calc.mjs`. Nothing is uploaded. England, Wales and Northern Ireland rates for 2026/27 (dividend tax 10.75% / 35.75% / 39.35%, employer NI 15% over £5,000, Class 4 NI 6% / 2%, corporation tax with marginal relief). Scottish income tax bands, student loans and pension contributions are not modelled. The page tells you to confirm rates on GOV.UK.

```
node --test 'ventures/uk-sole-trader-vs-limited-company-calculator/**/*.test.mjs'
```

Free and MIT-licensed; GitHub Sponsors is optional. Not tax advice.
