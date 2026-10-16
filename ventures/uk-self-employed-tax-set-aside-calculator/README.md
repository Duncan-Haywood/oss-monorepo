# UK Self-Employed Tax Set-Aside Calculator (2025/26 and 2026/27)

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/uk-self-employed-tax-set-aside-calculator/>

Free, private browser tool: enter self-employed income and expenses and get income tax with the personal allowance taper, Class 4 National Insurance, student loan repayments, the payments-on-account cash call and the share of every invoice to set aside. Flags VAT registration and applies the £1,000 trading allowance when it beats real expenses.

After using this, a UK sole trader knows how much to move out of each payment instead of finding a bill, plus a payment on account, on 31 January.

Open `index.html`. Tests: `node --test 'ventures/uk-self-employed-tax-set-aside-calculator/**/*.test.mjs'`.

**No warranty.** Free and as-is; not tax advice. Tables written from memory of HMRC published rates; Scottish bands not modelled; verify on gov.uk. See `VENTURE.yaml`.
