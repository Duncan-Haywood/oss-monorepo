# Chiropractor New Patient ROI Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/chiropractor-new-patient-roi-calculator/>

A free browser calculator for chiropractic, physical therapy and wellness
clinics. Nothing is uploaded.

After using this, you can now **see what a new patient costs you to win, what
they are worth, and the most you can pay per lead** — which used to mean an
agency report or a hand-built spreadsheet.

## Try it

Open [`index.html`](index.html), click **Load an example**, then replace the
numbers with your own.

## What it calculates (`calc.mjs`, pure functions, no dependencies)

- `parseSegments` — one patient type per line (comma or tab separated); bad
  lines are reported, never dropped.
- `segmentValue` — revenue, delivery cost and margin for one new patient.
- `analyse` — funnel (leads, booking, show), cost per new patient, return,
  payback in visits, ceiling cost per patient and per lead, monthly profit,
  plain-English findings.

## Limits, stated

Averages only: no referrals, reactivations, denials or timing. Not accounting,
tax, legal or medical advice; margin is never a reason to recommend a number of
visits. See the page.

## Tests

`node --test`
