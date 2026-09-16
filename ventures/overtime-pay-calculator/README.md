# Overtime Pay Calculator

A free browser calculator for hourly overtime pay: standard time-and-a-half
for one hourly rate, plus the FLSA weighted-average ("blended rate")
calculator for a workweek where an employee worked at two or more different
hourly rates. Entirely client-side; nothing is uploaded.

After using this, you can now **turn an hourly rate and hours worked into a
correct overtime pay total in seconds, and get the correct blended overtime
rate for a week worked at two or more different pay rates — the case that is
genuinely easy to get wrong by hand, because the overtime premium is half the
blended rate, not the full rate** — arithmetic that otherwise means a
spreadsheet, a payroll manual, or guessing.

## Why this exists

Two overtime questions come up constantly for hourly payroll: the simple
one ("time and a half past 40 hours") and the one people actually get
wrong — an employee who worked, say, a warehouse shift at one rate and a
front-desk shift at another in the same week. Under the federal FLSA
weighted-average method (29 CFR 778.115), the regular rate for that week is
**total straight-time earnings divided by total hours**, not either rate on
its own, and the overtime premium is **half** that blended rate per overtime
hour — not the full 1.5x, because straight-time pay for the overtime hours
is already counted once in the total. That "half, not the full rate" step is
the part a spreadsheet built from intuition usually gets backwards.

## Try it

Open [`index.html`](index.html). For standard overtime, enter the hourly
rate and hours worked and click **Calculate**. For the blended-rate case,
add a row for each distinct pay rate with its hours, then click **Calculate
blended rate**.

## What it calculates

Both in [`calc.mjs`](calc.mjs), as pure functions with no dependencies:

- **`computeSingleRateOvertime`** — regular hours up to the threshold (40 by
  default) at the entered rate, overtime hours past it at the rate times the
  overtime multiplier (1.5 by default). Threshold and multiplier are both
  configurable, for states or agreements that set a different rule.
- **`computeWeightedAverageOvertime`** — the FLSA weighted-average method:
  sums straight-time pay across every rate entered, divides by total hours
  for the blended regular rate, then adds half that rate per overtime hour
  as the premium (the other half is already inside the straight-time total).
- **`formatWeightedBreakdown`** — renders a blended-rate result as the
  plain-text breakdown a payroll admin or employee can paste into a record
  or a pay question: every rate and its hours, the blended rate, the
  overtime premium, and the total.

## Copy the breakdown

Next to the blended-rate result, **Copy breakdown** puts the full arithmetic
on the clipboard as plain text. Three deliberate choices, the same ones
`security-deposit-return-calculator`'s statement copy makes:

- **The disclaimer travels with the text**, because the breakdown's whole
  purpose is to leave the tool.
- **It is served from the last calculated result**, never recomputed from
  the live inputs on click — editing a row without pressing Calculate must
  not email a number the screen is not showing.
- **A blocked clipboard is not a dead end** — a failure reveals a read-only
  textarea with the breakdown selected.

## Disclaimers

Federal FLSA rules only. Several states require more — daily overtime past a
set number of hours in a single day, a double-time threshold, a higher
minimum multiplier — and nondiscretionary bonuses or shift differentials can
also change the regular rate under FLSA. This is not legal, tax, or payroll
advice; check your state's rules and your own pay policy before relying on
the total.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy

Everything runs in your browser. The numbers you enter are **never
uploaded** — there is no server component at all. Anonymous feature events
(`overtime_calculated`, `blended_calculated`, `breakdown_copied`,
`example_loaded`) are counted in `localStorage` only, never transmitted. Do
Not Track and Global Privacy Control are honoured, and a button on the page
turns counting off entirely.

## Development

```sh
node --test calc.test.mjs usage.test.mjs page.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). Both calculators and
their test suites are done; no external user contact has happened yet — see
`kill_criteria` in `VENTURE.yaml`.
