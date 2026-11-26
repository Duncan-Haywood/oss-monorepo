# UK Holiday Entitlement and Pay Calculator

Free, private browser tool: enter your leave year and working pattern and see statutory holiday in Great Britain (5.6 weeks, the 28-day cap), pro-rated for starters and leavers, the 12.07% method for irregular hours and part-year workers, days left, and what unused days are worth in final pay.

**Live tool:** https://marisstella.app/uk-holiday-pay-calculator/

After using this, you know your holiday and whether your contract or final pay is short, which used to mean multiplying by 5.6 and pro-rating by hand.

Open `index.html`. Tests: `node --test 'ventures/uk-holiday-pay-calculator/**/*.test.mjs'`.

**No warranty.** Free and as-is; not tax or legal advice. Rules were written from memory and must be verified against the source each result names. See `VENTURE.yaml`.

## Known gaps

From quality audit round 114 ([`2026-11-26-uk-holiday-pay-calculator.json`](../../portfolio/quality/audits/2026-11-26-uk-holiday-pay-calculator.json)):

- Irregular hours take 12.07% of a yearly total. The rules (WTR reg 15B, GOV.UK) accrue it per pay period, rounded to the nearest hour from 0.5: 30 hours in a weekly period earns 4 hours, where this tool shows 3.62. A year of 30-hour weeks is 208 hours, not 188.29. Fixing it needs a pay-period input.
- The contract field does not say whether bank holidays are included, so "25 days plus bank holidays" can be reported as below the statutory minimum.
- No first-year monthly accrual (reg 15A), and bank holidays are not limited to the employed part of the year.
