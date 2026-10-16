# UK VAT registration checker (2026/27)

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/uk-vat-registration-checker/>

After using this, a UK freelancer or small trader can paste their monthly sales and see the month their rolling 12-month turnover passed the £90,000 VAT threshold, the date they must tell HMRC, when registration starts, and whether the Flat Rate Scheme beats standard accounting — which used to mean a spreadsheet and a read of three GOV.UK pages.

Static browser tool: `index.html` + `calc.mjs`. Nothing is uploaded. Rules written from memory (threshold £90,000, 30-day notification, effective from the first day of the month after next, Flat Rate Scheme sector percentages, 16.5% limited cost trader rate); the page tells you to confirm them on GOV.UK.

```
node --test 'ventures/uk-vat-registration-checker/**/*.test.mjs'
```

Free and MIT-licensed; GitHub Sponsors is optional. Not tax advice.
