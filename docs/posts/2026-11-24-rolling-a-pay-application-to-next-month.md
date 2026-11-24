---
title: "Rolling a pay application forward to next month, to the cent"
seo_title: "Carry a schedule of values forward to the next pay app"
date: 2026-11-24
tags: [construction, subcontractors, pay-applications, retainage]
description: "The free pay application generator now rolls a schedule of values to next month and carries previous certificates exactly, so the payment due is not an estimate."
---

The [pay application generator](https://marisstella.app/pay-application-generator/)
worked out one month at a time. Next month you had to rebuild the
schedule of values yourself: add this period into previous, clear this
period, and find last month's certified total for the "less previous
certificates" line. If you skipped that last part, the page estimated it
as previous work less retainage at today's rate, and said so. The estimate
is wrong whenever the retainage rate has changed during the job.

It now has a **Next month** step. From a finished application it:

- sets each line's previous to previous plus this period;
- sets this period to zero;
- leaves stored materials in the stored column. On a continuation sheet,
  stored materials are kept apart from work until they are installed, so
  the page tells you which lines still carry stored materials and asks you
  to move them into this period once they are installed;
- keeps change orders as change orders, and keeps any line's own
  retainage rate;
- adds one to the application number and moves the period end a month
  (a period that ended on the last day of a month ends on the last day of
  the next one);
- sets previous certificates to this application's **total earned less
  retainage** (line 6). Previous certificates plus the payment due add up to
  that line, so once this application is paid in full, that is what has
  been certified. If the owner certified less, you type in the real figure.

You can start next month on the page straight away, or download the CSV and
open it next month. Nothing is uploaded or saved by the page; the file is
your record.

## How it is checked

Three properties are tested in
[`calc.test.mjs`](../../ventures/pay-application-generator/calc.test.mjs):

1. A month rolled forward with no new work is due exactly $0.00. Taking
   the worked example, a renovation with a $532,300 contract sum to date after two change orders, the
   rolled application has $0.00 due and no "estimated" finding.
2. $10,000 of new drywall billed on the rolled schedule at 10% retainage
   is due exactly $9,000.
3. Three months chained (25%, then 20%, then 30% of a framing line, with
   stored roofing material) pay out, summed, exactly the third month's
   total earned less retainage. No cent goes missing between months.

## What it does not do

It does not save jobs, track retainage until release, write lien waivers or
handle several jobs at once. Those are the jobs of the hosted pay-app suite
we are building for subcontractors, which is **in development**, not on sale
and not priced (the
[earlier post](2026-11-24-pay-applications-the-monthly-paperwork-subcontractors-pay-to-escape.md)
has the competitor prices and the plan). The tool page now says so and links
to the site's public feedback form for early access.

The page is not the AIA G702/G703 form and is not affiliated with the AIA.
It does the arithmetic on your figures. Your contract decides the retainage
terms, and it is not legal or accounting advice.
