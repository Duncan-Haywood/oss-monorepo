# Personal Trainer Package Pricing Calculator

A free browser calculator for independent personal trainers: compares a
discounted prepaid session package against pay-per-session pricing on net
take-home pay per hour, after your gym or studio's percentage revenue-share
or flat facility fee. Entirely client-side; nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/personal-trainer-package-pricing-calculator/

After using this, you can now **see whether your session package actually
pays better per hour, net of your venue's cut, than charging full price per
session — not just whether it looks safer on billings** — the gap most
trainers never separately check.

## Why this exists

A prepaid package is sold, and bought, as protection against no-shows: the
client has already paid, so a missed session does not cost the trainer that
fee. That half is true. Two things usually go unchecked:

1. **The dilution `tutor-package-pricing-calculator` already catches.** If
   the package also promises a **makeup** for a missed session rather than
   letting it lapse, the trainer still works that hour eventually. The
   discount that made the package attractive to sell is then paid on every
   hour once they are all delivered — a package discounted deeper than the
   real no-show rate, with makeup owed, can pay a **worse** effective hourly
   rate than simply charging full price per session.
2. **A mechanic tutoring has no equivalent of.** Most independent trainers
   pay their gym or studio either a percentage of every session or a flat
   per-session facility fee. A flat fee does not shrink with the trainer's
   own discount — it is a bigger *percentage* of a discounted package
   session than of a full-price single session, so the trainer's own
   discount and the venue's flat cut compound against the same hour. A
   percentage revenue-share cut does not do this: it takes the same share of
   both, so it scales the comparison down without changing which side wins.

## Try it

Open [`index.html`](index.html), enter your single-session rate, a package
size and price, a no-show rate, whether a missed session earns a makeup, and
your gym or studio's cost structure, then click **Compare**.

## What it calculates

In [`calc.mjs`](calc.mjs), as pure functions with no dependencies:

- **`comparePricing`** — for one representative block of sessions, computes
  gross billings, net take-home (after a percentage or flat venue cost),
  hours worked, and net effective hourly pay under both pay-per-session (a
  no-show simply frees the slot, unpaid, unworked, and not charged by the
  venue) and a prepaid package (billings are guaranteed; hours worked, and
  so a flat fee owed, depend on whether a missed session is made up or
  forfeited). Flags a package discount deeper than the no-show rate when
  makeup is owed, a flat venue fee that erodes the package's discounted rate
  more than the full rate, a net effective hourly rate below the trainer's
  stated take-home target, and the package price that would clear that
  target instead.
- **`formatComparisonSummary`** — renders a comparison result as the
  plain-text summary a trainer can paste into a note to themselves: both
  models' net revenue, hours, and net effective hourly pay, the deltas, and
  the disclaimer.

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
it does not track which specific client owes a makeup, does not schedule
anything, and does not predict any one client's actual attendance. It is not
tax, legal, or financial advice.

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
node --test calc.test.mjs usage.test.mjs page.test.mjs vs-a-spreadsheet.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The calculator and its
test suite are done; no external user contact has happened yet — see
`kill_criteria` in `VENTURE.yaml`.
