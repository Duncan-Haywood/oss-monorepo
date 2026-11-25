---
title: "Quality fix: DCMA missed tasks and BEI against the real baseline, not P6's moving planned dates"
seo_title: "DCMA missed tasks and BEI from a baseline XER, free in the browser"
date: 2026-11-25
tags: [quality-audit, for-customers, xer-schedule-check, construction, scheduling, primavera-p6, xer, dcma]
description: "P6 resets a not-started activity's planned dates on every schedule run, so overdue unstarted work never counted as missed. XER Schedule Check now scores points 11 and 14 against the baseline project's XER."
---

Two of the DCMA 14 points ask whether the job is keeping its promises.
**Missed tasks** (point 11) counts the activities that should have finished
by the data date and did not. **The baseline execution index** (BEI, point
14) divides the activities finished so far by the number the baseline said
would be finished by now. Both need a baseline. A single XER export usually
carries only the current update.

Until today [XER Schedule Check](../../ventures/xer-schedule-check/) used
P6's planned dates (`target_end_date`) as the baseline. That is what you get
when a project uses its own planned dates as its baseline. It only holds for
work that has started. Every time P6 schedules, it resets a not-started
activity's planned dates to its early dates. The quality audit of
2026-11-19 found this on the public CCA sample, where 11,775 of 11,775
not-started activities had a planned finish equal to their early finish. Its
record is in
[`portfolio/quality/audits/2026-11-19-xer-schedule-check.json`](../../portfolio/quality/audits/2026-11-19-xer-schedule-check.json),
defect 0, high severity.

The effect: an activity due three weeks ago that nobody has started
carries a planned finish of next month. It is never "due", so it is never
"missed", and it never enters BEI's denominator. A badly slipped update
could pass both points. The page already disclosed this. Disclosing it does
not fix it.

## What changed

You can now open the baseline project's XER, or its P6 or Microsoft Project
XML, next to the current update:

- **On the page:** use the new *Baseline project (optional)* input under
  *Your schedule*. The scorecard re-runs, and the status line says how many
  activities matched.
- **From the command line:** `node cli.mjs update.xer --baseline baseline.xer`.
  The text output now says which baseline it used.

Each activity is matched to the baseline by activity ID, not by P6's
internal `task_id`, which changes when a project is copied. Its baseline
finish is its actual finish in the baseline file if it had one, else the
early finish P6 stored when the baseline was set, else the planned finish.
That is the same rule the GAO practice 10 check already used. The two now
share one function (`baselineFinishes` in `dcma.mjs`), so the DCMA
scorecard and the GAO scorecard cannot disagree about the same file.

Activities added since the baseline count in neither point: the baseline
promised nothing about them. With no baseline file, both points fall back
to the planned dates as before. The note on each point says so and tells
you to open the baseline.

## How it was checked

- `dcma-baseline.test.mjs`: five tests.
  - The audit's case: a not-started activity whose planned finish P6 has
    moved past the data date. It is missed against a baseline that had it
    due, and not missed against planned dates.
  - Every activity due on the baseline: missed tasks and BEI equal hand
    counts from the file.
  - The DCMA and GAO checks agree on the example baseline and update pair:
    the same four missed activities (A1010, A1020, A1030, A1050) and BEI
    0.5.
  - A finished activity added since the baseline stays out of BEI.
  - An empty baseline file falls back to planned dates, with a warning.
- Two seeded bugs, both caught by the new tests:
  - Treating an empty baseline as present.
  - Counting activities that are not in the baseline. This one survived
    until the fifth test was added.
- The venture's full suite (`run_venture_tests.py xer-schedule-check`):
  565 tests passing with the first four new ones; the fifth passes on its
  own run. In a headless browser, the example schedule with its previous
  update as the baseline reads "22 of 22 activities matched by activity ID",
  with no console errors.

## Not checked yet

No public P6 baseline and update pair of one real job is on hand, so this
is checked on the example pair and on planted cases, not on a real
project's history. That pair is the next thing to find. It is listed in the
venture's `NEXT.md`.

The audit's other open defects are still open:
- Points with nothing to measure score as a pass.
- Five DCMA points have no direct assertion.
- Every start and finish milestone is exempt from point 1.

A later quality round re-audits the subject. This fix does not change its
2026-11-19 scores.

*Screening metrics on your own file, not scheduling, contractual or legal
advice. Not affiliated with Oracle, Primavera or the DCMA.*
