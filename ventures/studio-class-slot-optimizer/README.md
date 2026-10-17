# Studio Class Slot Optimizer

A free browser tool for fitness, yoga, pilates and dance studios: **paste or upload an attendance log (one row per
class held: slot, attended, optional capacity) and see which timetable slots lose money, your break-even class size,
and which classes are full enough to need a second one.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/studio-class-slot-optimizer/

After using this, you can now **decide which classes to cut, move or double from your own numbers**, which used to
take a gut feeling about "the Tuesday noon class" or a booking-software report that shows attendance but not whether
it pays for the instructor.

## Model

- Input: rows of `slot,attended[,capacity]` (a header may reorder columns by name; tab or comma separated).
  Attendance above capacity is capped with a warning.
- Per slot: mean attendance, shrunk toward the all-slot mean by an empirical-Bayes weight
  `(n*mean + k*grand) / (n + k)`, `k` = within-slot variance / between-slot variance (clamped 0.5 to 20).
- Earns per class = adjusted mean x (revenue - extra cost per attendee) - cost to run one class.
- Gain from cutting = cost to run - (1 - switch share) x adjusted mean x margin. Switch share defaults to 0.4.
- 300 seeded bootstrap resamples of each slot's classes give 10th-90th percentile ranges.
- Verdicts: `cut or move` (gain > 0 in at least 80% of resamples), `keep` (gain < 0 in at least 80%),
  `full: add a class` (adjusted fill at least 90% and low range at least 85%), otherwise `watch`.
- Warns when the remaining slots lack spare seats for the attendees the switch share sends over.
- Refuses: fewer than 20 classes, fewer than 4 slots with 3+ classes, missing money inputs.

## Limits

Membership and pack revenue that does not depend on one class, seasons, instructor draw and class-to-class feeding
are not modelled, and a full room hides demand. Verified only against simulated timetables.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.
