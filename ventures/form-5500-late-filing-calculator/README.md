# Form 5500 Late Filing Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/form-5500-late-filing-calculator/>

A free browser tool for small-business 401(k) and retirement-plan sponsors who missed, or may
miss, the Form 5500 deadline: **enter the plan year end and the date you intend to file and see
the due date, how late you are, and what the DOL's DFVC programme costs next to the IRS and DOL
penalty ceilings.** Nothing is uploaded and no login is needed.

After using this, you can now **see whether filing late through the DFVC programme costs a few
hundred dollars or a few thousand, what the statutory ceilings look like beside it, and the steps
to file**, which used to mean reading three agency pages and a provider's email.

## Inputs

Plan year end, plan type (small, large, one-participant), total assets, participants, whether a
Form 5558 extension was filed, the date you intend to file, and how many annual reports are
unfiled. Penalty figures are editable on the page.

## Model

Due date is the last day of the seventh month after plan year end (Form 5558: the 15th of the
tenth month), rolled to the next business day past weekends and federal holidays. DFVC is $10 a day,
capped per report and per plan. IRS exposure is $250 a day to $150,000 per return. DOL exposure is
an "up to" statutory per-day maximum. The IRS and DOL figures are ceilings, not predictions.

**Every figure is from memory of the published programme and statute, not read from a live source,
and the DOL maximum is inflation-adjusted each year. Verify against current DOL and IRS guidance.**

## Run

Open `index.html` through any static server. Tests: `node --test`.
