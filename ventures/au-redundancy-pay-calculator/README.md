# Australian redundancy pay calculator

Free, private browser tool: enter weekly pay, start and end dates, age and employer size to see NES redundancy weeks, minimum notice, unworked notice payout and accrued annual leave, with the small business, casual and fixed-term exclusions explained.

**Live tool:** https://marisstella.app/au-redundancy-pay-calculator/

After using this, an employer, HR manager or employee knows what the National Employment Standards require on a redundancy, which used to mean reading the Fair Work table, the notice rules and a leave calculation separately.

Open `index.html`. Tests: `node --test 'ventures/au-redundancy-pay-calculator/**/*.test.mjs'`.

**No warranty.** Free and as-is; not legal or employment advice. Rules written from memory; verify with the Fair Work Ombudsman. See `VENTURE.yaml`.

## Known gaps

From the [2026-11-17 quality audit](../../portfolio/quality/audits/2026-11-17-au-redundancy-pay-calculator.json), checked against the Fair Work Act 2009 compilation in force on 2026-07-07:

- **Fixed:** casual and fixed-term employees were shown an NES notice payout; s123(1)(a) and (c) take them out of Division 11, so they now get none (`calc.test.mjs`).
- **No notice date.** s117(3) measures service for notice on the day notice is given, and s121(1)(a) applies the under-12-months exclusion at the earlier of notice or termination. The tool measures both at the last day, so notice given at 11 months with a last day at 13 months shows 4 weeks of redundancy pay the Act does not give.
- **Notice paid at base rate.** s117(2)(b) pays unworked notice at the full rate of pay (with loadings, allowances and overtime the employee would have earned), not the base rate.
- **Trainees.** The "Apprentice / trainee" option drops redundancy pay for every trainee; s123(1)(d) excludes a trainee only when the training arrangement is for a fixed period or its length.
- Not modelled: the s23 headcount rules, transfer of business, the s121(4) insolvency exception, industry redundancy schemes, and casual service that counts after conversion.
