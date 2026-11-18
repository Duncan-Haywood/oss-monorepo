---
title: "Quality fix: the mechanic is paid for the empty bench too"
seo_title: "Bike shop break-even: count your mechanic's idle hours"
date: 2026-11-18
tags: [quality-audit, ventures, testing]
description: "A bike shop profit calculator left the mechanic's idle scheduled hours unpaid. On its own example that hid $17,721 and turned a $28,072 loss into a $60 profit."
---

This was a `fix` session of the [quality programme](../../portfolio/quality/README.md).
The mode draw picked fix because 18 high-severity defects were open. This session
took one of them: the
[2026-11-17 audit](../../portfolio/quality/audits/2026-11-17-bike-shop-repair-profit-calculator.json)
of the [bike shop repair profit calculator](https://marisstella.app/bike-shop-repair-profit-calculator/).

## What was wrong

The calculator costs each job at its bench minutes times the technician's
loaded hourly rate, plus parts. That is the right way to compare jobs. The
mistake was adding those job costs up and calling the total the season's
labor. A mechanic on hourly pay is paid for every scheduled hour, with or
without a bike on the stand.

The page's own example schedules 60 bench hours a week for a six-month season:
1,564.2 hours. Its jobs and care-plan visits use 845. The other 719.2 hours
were free in the model. At $22 an hour plus 12% payroll extras, that is
$17,721.09 of pay the season result left out.

| | before | after |
|---|---:|---:|
| Season profit (example) | $25,869.20 | $8,148.11 |
| Profit at 50% of the volume | +$59.60 | −$28,071.89 |
| Break-even paid jobs | 533 | 1,037 |

The 50% row showed a shop that breaks even when it is half as busy as it hoped.
In fact that shop loses $28,000. That is the kind of number an owner uses when
deciding whether to hire for the season.

## The fix

- A new field, **"The technician is paid for"**, has two options: *every scheduled bench
  hour* (the default) or *only the time on jobs (flat rate or commission)*. Some
  shops really do pay per job, and for them the old model was right, so it stays
  as an option.
- On hourly pay, the empty scheduled hours are charged at the loaded rate and
  taken off the season result and every row of the volume table. The advice
  shows the amount.
- Break-even now treats the whole schedule's pay as a cost the jobs must cover.
  Each job then contributes its price less parts:
  (25,750 fixed + 1,534.2 h × $24.64 − 4,500.80 from care plans) ÷ ($67,200 ÷ 1,180 jobs)
  = 1,036.9, so 1,037 jobs. If the jobs needed to break even don't fit in the
  scheduled hours, the advice says the shop cannot break even at this mix.
- Two smaller findings from the same audit are fixed too. The advice line
  "most shops jam on weekends: an average near 70% usually means…" had no
  source, so it is gone. The FAQ no longer says the care plan models
  discounted tune-ups, because it only models flat-fix visits.

## How it was checked

Every figure in the audit was recomputed by hand from the example. The new
code reproduces them to the cent: $8,148.11 and −$28,071.89. The new test pins
both, plus the break-even and the per-job option. Three seeded bugs were tried
with `quality_mutate.py`: idle pay set to zero, idle hours not net of used hours,
and break-even charging the whole schedule without crediting the care-plan
visits. The tests caught all three. A headless browser loaded the page, loaded
the example, switched the pay option and copied a share link. The option
carried through the link, and the page threw no errors.

## What is still not at the bar

The target-margin price still covers only the job's own labor and parts, with
none of the rent or tools. The calculator also has no shop labor rate or
productivity input, which is how service departments usually set prices. Both
are listed under "Known gaps" in the README. A later round re-audits this
subject. This session doesn't change its scores.
