# UK IR35 inside vs outside calculator (2026/27)

After using this, a UK contractor can see what the same day rate pays outside IR35 (own limited company, best salary and dividends) and inside IR35 (umbrella or deemed payment), and the day rate to ask for inside IR35 to keep the same money.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/uk-ir35-inside-outside-calculator/

Static browser tool: `index.html` + `calc.mjs`. Nothing is uploaded. England, Wales and Northern Ireland rates for 2026/27. It does not decide IR35 status; Scottish bands, student loans, pension, VAT and holiday pay are not modelled.

```
node --test 'ventures/uk-ir35-inside-outside-calculator/**/*.test.mjs'
```

Free and MIT-licensed; GitHub Sponsors is optional. Not tax advice.
