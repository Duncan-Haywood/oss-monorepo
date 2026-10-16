# Tutor Package Pricing Calculator

A free browser calculator for independent tutors, test-prep coaches, and
similar 1:1 instructors: compares a discounted prepaid session package
against pay-per-session pricing, on both revenue and effective hourly pay.
Entirely client-side; nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/tutor-package-pricing-calculator/

After using this, you can now **see whether your session package actually
pays better per hour than charging full price per session, not just whether
it looks safer on revenue** — the gap most instructors never separately
check.

## Why this exists

A prepaid package is sold, and bought, as protection against no-shows: the
student has already paid, so a missed session does not cost the instructor
that fee. That half is true. What usually goes unchecked is the other half
— if the package also promises a **makeup** for a missed session rather than
letting it lapse, the instructor still works that hour eventually. The
discount that made the package attractive to sell is then paid on every hour
once they are all delivered, not just the hours actually attended the first
time. A package discounted deeper than the real no-show rate, with makeup
owed, can pay a **worse** effective hourly rate than simply charging full
price per session and letting a no-show free that slot — while its revenue
line looks like the safer choice the whole time.

## Try it

Open [`index.html`](index.html), enter a single-session price, a package
size and price, a no-show rate, and whether a missed session earns a makeup,
then click **Compare**.

## What it calculates

In [`calc.mjs`](calc.mjs), as pure functions with no dependencies:

- **`comparePricing`** — for one representative block of sessions, computes
  revenue, hours worked, and effective hourly pay under both pay-per-session
  (a no-show simply frees the slot, unpaid and unworked) and a prepaid
  package (revenue is guaranteed; hours worked depend on whether a missed
  session is made up or forfeited). Flags a package discount deeper than the
  no-show rate when makeup is owed, an effective hourly rate below the
  instructor's stated target, and the package price that would clear that
  target instead.
- **`formatComparisonSummary`** — renders a comparison result as the
  plain-text summary an instructor can paste into a note to themselves:
  both models' revenue, hours, and effective hourly pay, the deltas, and the
  disclaimer.

## Copy the comparison

**Copy comparison** puts the full comparison on the clipboard as plain text.
Three deliberate choices, the same ones `overtime-pay-calculator`'s
breakdown copy makes:

- **The disclaimer travels with the text**, because the comparison's whole
  purpose is to leave the tool.
- **It is served from the last calculated result**, never recomputed from
  the live inputs on click — editing a field without pressing Compare must
  not copy a number the screen is not showing.
- **A blocked clipboard is not a dead end** — a failure reveals a read-only
  textarea with the comparison selected.

## Disclaimers

This applies the numbers entered to one representative block of sessions —
it does not track which specific student owes a makeup, does not schedule
anything, and does not predict any one student's actual attendance. It is
not tax, legal, or financial advice.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy

Everything runs in your browser. The numbers you enter are **never
uploaded** — there is no server component at all. Anonymous feature events
(`comparison_calculated`, `summary_copied`, `example_loaded`) are counted in
`localStorage` only, never transmitted. Do Not Track and Global Privacy
Control are honoured, and a button on the page turns counting off entirely.

## Development

```sh
node --test calc.test.mjs usage.test.mjs page.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The calculator and its
test suite are done; no external user contact has happened yet — see
`kill_criteria` in `VENTURE.yaml`.
