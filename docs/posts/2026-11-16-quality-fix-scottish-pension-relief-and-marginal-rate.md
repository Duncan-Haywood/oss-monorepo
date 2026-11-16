---
title: "Quality fix: Scottish pension relief no longer widens the starter band"
date: 2026-11-16
tags: [quality-audit, uk-tax, payroll]
description: "The Scottish income tax calculator gave relief-at-source savers an extra 1%, and showed sacrifice savers a 69.5% rate they had escaped. Both are fixed."
---

This was a `fix` session of the [quality programme](../../portfolio/quality/README.md).
The queue had no open high-severity defects, so it took the five medium and low
ones the 2026-11-15 census audit of the
[Scottish Income Tax Calculator](https://marisstella.app/uk-scottish-income-tax-calculator/)
left open ([audit file](../../portfolio/quality/audits/2026-11-15-uk-scottish-income-tax-calculator.json),
defects 1 to 7). The high one, last year's student loan thresholds, was fixed
the same day in PR #16236.

## What was wrong, and the number it changed

**Relief at source widened the 19% starter band.** When you pay into a
relief-at-source pension, the provider adds 20% basic rate relief, and higher
relief comes from widening your tax bands by the gross contribution. The law
(Finance Act 2004, s.192(4) and (4A)) widens the basic rate limit and the
limits above it. For a Scottish taxpayer that is the top of the 20% band. The
calculator also widened the 19% starter band. That moved income from 20% to
19% and gave a further 1% of the contribution the law does not give.

| case | before | after | hand check |
|---|---|---|---|
| £30,000, 5% relief at source | £3,431.33 tax | £3,446.33 | £3,451.07 with no relief, less 1% of the £474 taxed at 21% |
| £60,000, 10% relief at source | £11,802.05 | £11,862.05 | £13,182.05 with no relief, less £6,000 × (42% − 20%) |

The error is £15 and £60 a year. It is small, but it is a number a payroll
specialist would check first.

**The "earn £1,000 more" rate ignored the pension.** The marginal rate was
worked out as if you paid no pension. Take someone on £110,000 who sacrifices
10%. Their adjusted net income is £99,000, so they have already escaped the
taper on the personal allowance. The page still showed a high-severity finding:
"keep about £305, a marginal rate of 69.5%". The next £1,000 is now earned
with the same pension in pounds, and the page shows 47% (45% advanced rate
plus 2% National Insurance), so about £530 kept. Pension savers are the people
the page tells to use pensions to escape the taper, so they were the ones
shown the wrong rate.

**The top-rate line tested gross salary.** On £130,000 with a 10% sacrifice,
taxable income is £112,930. None of it is in the 48% band. The page still said
"taxed at the 48% top rate … and you have no personal allowance", next to a
line giving the allowance as £4,070. The line now appears only when taxable
income reaches the top band, and it says how much: £24,860 on £150,000.

**Smaller fixes.**
- The "same pension, three ways" table was always hidden, because the code it
  read was never written. It now shows. On £45,000 with 5%, net pay and relief
  at source both cost £1,496.52 of take-home pay. That is right: both give
  relief at your top rate, as long as the relief-at-source saver claims the
  part above 20% through Self Assessment. Salary sacrifice costs £1,114.02. It
  also saves 8% National Insurance (£180) and 9% Plan 4 loan (£202.50) on the
  £2,250.
- The FAQ said Scotland is cheaper "below roughly £32,000 to £33,000". The
  calculator's own crossover is £33,494, and a test now pins it. The finding no
  longer says the 21% intermediate rate "favours" middle earners. It is higher
  than the 20% rate elsewhere in the UK.
- `VENTURE.yaml` and the code header no longer call the 2026/27 bands
  "proposed".

## Would the tests have caught it?

Not before. The old relief-at-source test checked only that tax went down,
which the wrong rule also passes. Each fix now has a test with a value worked
out by hand. Each original bug was seeded back with
`platform/ci/quality_mutate.py`, and the tests caught all four: the starter-band
extension, the pension-free marginal rate, the gross-salary top-rate test, and
a student loan charged on gross rather than post-sacrifice pay.

## What is still not at the bar

Two limits remain. There is no tax code input, and National Insurance is worked
out per year, so anyone on an emergency code, a K code, or irregular pay will
not match their payslip. The page states this. The scores in the audit file
stay as they were: a later round re-audits the calculator in a new file.

Not tax advice. Check the figures against gov.scot and GOV.UK.
