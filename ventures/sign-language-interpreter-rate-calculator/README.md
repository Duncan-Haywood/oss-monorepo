# Sign Language Interpreter Rate Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/sign-language-interpreter-rate-calculator/>

A free calculator that turns a freelance or contract sign language (ASL)
interpreter's assignment request into a defensible fee — hours requested
against a booking minimum, portal-to-portal travel time and mileage, an
after-hours/weekend/holiday differential, and a flag for when the setting
and length suggest a two-interpreter team — plus a separate late-cancellation
fee calculator. Entirely client-side; nothing is uploaded.

After using this, you can now **turn an assignment request into a defensible
fee, including travel and any after-hours differential, in seconds**, which
used to mean doing the minimum-hours, travel, and differential math by hand
mid-email, or skipping it and undercharging.

## Why this exists

"What should I charge for this booking?" comes up constantly in interpreter
communities (r/interpreters, RID's own membership discussions, interpreting
Discord and Facebook groups), and a flat hourly rate does not capture the
conventions that actually decide the number: a commonly cited two-hour
minimum for a freelance booking, travel time and mileage that is unpaid if
nobody asks for it, an after-hours or weekend differential, and — the piece
most often missed — whether a long, high-stakes assignment should be staffed
with two interpreters instead of one. RID's Standard Practice Papers name
legal, medical, and mental-health settings past about two hours as the cases
where a team prevents the accuracy drop that comes with interpreter fatigue,
and a solo freelancer doing the arithmetic mid-negotiation has nothing to
remind them of that. This tool applies all of it to an interpreter's own
numbers, with nothing to sign up for.

## Try it

Open [`index.html`](index.html), enter an assignment's hours, rate, setting,
and travel, and click **Calculate my rate**. A second section works out a
late-cancellation fee from a previously scheduled fee and the notice given.

See also: [this calculator vs. a flat fee per assignment](vs-a-flat-fee-per-assignment.html).

## What it calculates

All in [`calc.mjs`](calc.mjs), two pure functions with no dependencies:

- **`computeAssignmentQuote`** — bills the greater of hours requested or a
  configurable booking minimum (defaulting to a commonly cited 2 hours), at
  an hourly rate scaled by an after-hours/weekend (×1.5) or holiday (×2)
  differential. Adds portal-to-portal travel time (billed round-trip at a
  configurable fraction of the hourly rate) and mileage. If the booking runs
  past 2 hours in a legal, medical, or mental-health setting and "team
  interpreting" is not checked, it surfaces RID's own team-interpreting
  guidance as a finding rather than silently pricing one interpreter for a
  six-hour deposition. Checking team interpreting doubles the interpreting
  fee (not travel or mileage, which the tool discloses rather than assumes).

- **`computeCancellationFee`** — applies a tiered notice schedule (full fee
  inside 24 hours, half the fee 24-48 hours, no fee beyond 48 hours by
  default) to a previously scheduled fee. The tiers are adjustable inputs,
  not a standard — interpreting contracts vary.

Every multiplier, minimum, and tier is a widely cited industry convention
exposed as an adjustable input, not a fixed standard. Every output is a
**starting point for a negotiation or an invoice draft, never a quote,
guarantee, or valuation performed on the interpreter's behalf** — and this
tool is not legal or medical advice about the underlying assignment, only a
pricing calculator for the interpreting work itself.

## Disclaimers

This is not legal, medical, or financial advice, and it is not a guarantee
of what any specific client or agency will pay — actual rates vary by
region, experience, certification, and what a specific booking is worth to a
specific buyer. Verify its output before relying on it, the same as any
free, best-effort tool.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy

Everything runs in your browser. The numbers you enter are **never
uploaded** — there is no server component at all. Anonymous feature events
(`quote-calculated`, `cancellation-calculated`, `example-loaded`) are
counted in `localStorage` only, never transmitted, never tied to your
identity. Do Not Track and Global Privacy Control are honoured, and a button
on the page turns counting off entirely.

## Development

```sh
node --test calc.test.mjs usage.test.mjs page.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The pricing logic and
its test suite are done for both the assignment quote and the cancellation
fee; no external user contact has happened yet — see `kill_criteria` in
`VENTURE.yaml`.
