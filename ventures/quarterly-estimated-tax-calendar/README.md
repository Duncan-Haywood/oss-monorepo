# Quarterly Estimated Tax Calendar

A free calculator for US freelancers, 1099 contractors, and gig workers that
applies the IRS's own safe-harbor rule (Form 1040-ES) to a filer's own
numbers — last year's tax, this year's estimate, what's already withheld or
paid — to produce a required quarterly payment, shows the **real** due date
for each quarter (adjusted for weekends and federal holidays, not just "the
15th"), and exports a downloadable `.ics` calendar with a reminder before
each one. Entirely client-side; nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/quarterly-estimated-tax-calendar/

After using this, you can now **know exactly what to pay the IRS each
quarter and by which real date, and get a reminder on your own calendar
before it's due** — which used to mean guessing at "the 15th" (wrong three
different ways in the last four years alone — see below) and either
over-paying out of caution or finding out about an underpayment penalty at
filing time.

## Why this exists

Two things about quarterly estimated tax trip up self-employed filers every
year, and neither is a matter of opinion:

1. **The due dates aren't always the 15th.** They shift to the next business
   day whenever the nominal date falls on a weekend or a federal holiday, and
   the shift can chain through more than one day. This isn't rare: the real,
   published IRS deadline moved in **three of the last four tax years** —
   April 18, 2022 (Emancipation Day observed the 15th, then a weekend),
   January 17, 2023 (the nominal date is a Sunday, and the Monday it lands on
   is MLK Day), and January 16, 2024 (the nominal date IS MLK Day that year).
   A filer who pays on "the 15th" in any of those years pays a day or three
   late.
2. **How much is required is a computable floor, not a guess.** The IRS
   safe harbor is the smaller of 90% of this year's estimated tax or
   100% (110% if last year's AGI was over $150,000, or $75,000 married
   filing separately) of last year's tax. Meeting that floor avoids an
   underpayment penalty regardless of what the final bill turns out to be —
   most filers have never seen the rule stated this precisely.

This tool computes both from numbers a filer already has, splits the result
into four quarters (Form 2210's own default method), and turns the due dates
into a calendar file so the deadline lives wherever the filer already checks,
not just on this page.

## Try it

Open [`index.html`](index.html), enter last year's total tax (and AGI, if
you know it) and this year's estimate if you have one, and click
**Calculate my schedule**. Download the `.ics` file to add reminders to your
own calendar.

## What it calculates

All in [`calc.mjs`](calc.mjs), pure functions with no dependencies:

- **`nextBusinessDay`** — shifts a nominal due date forward past weekends and
  the specific federal holidays that can land near a quarterly deadline
  (New Year's Day, MLK Day, the DC Emancipation Day quirk that moves Tax Day,
  Memorial Day, Juneteenth, Independence Day, Labor Day). Tested against the
  three real historical shifts above.
- **`requiredAnnualPayment`** — the IRS safe-harbor floor: the smaller of 90%
  of this year's estimate or 100%/110% of last year's tax, whichever the
  filer has a number for.
- **`computeSchedule`** — splits the net requirement (after withholding)
  evenly across the four quarters, compares against what's already been
  paid per quarter, and flags each quarter's status (paid, upcoming,
  due-soon, overdue). It also returns a **`pace`** object: the running
  requirement and running payments through the most recent due date compared
  against each other, plus the one number that actually matters if you're
  behind — how much the *next* payment should be to catch the safe harbor
  back up in one shot, rather than carrying a missed quarter's shortfall
  forward as an understated flat share on every remaining row. A filer who
  skipped Q1 entirely still sees "suggested: $2,000" on Q2's own row (that's
  correctly just Q2's flat quarter), but `pace.nextQuarterCatchUp` says
  $4,000 — Q1's missed share and Q2's own share together, the number a
  filer actually needs to send. Being ahead of pace works the same way in
  reverse: `pace.nextQuarterCatchUp` can be lower than the flat share, down
  to $0, and is never negative.
- **`icsCalendar`** — an RFC 5545 calendar with one all-day event and a
  7-day-ahead reminder alarm per unpaid quarter.

Every output is a **planning target to verify, never a filed amount or a
penalty determination performed on the filer's behalf** — the user remains
the filer and the decision-maker. The tool also always discloses that it
uses the even (regular) method rather than the Annualized Income Installment
Method (Form 2210 Schedule AI), which can help a filer with uneven income.

## Disclaimers

This is not tax, legal, or financial advice, and it does not replace a
qualified tax professional or the current-year IRS instructions. Verify its
output before relying on it, the same as any free, best-effort tool.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy

Everything runs in your browser. The numbers you enter are **never
uploaded** — there is no server component at all. Anonymous feature events
(`calculate_run`, `example_loaded`, `ics_downloaded`) are counted in
`localStorage` only, never transmitted, never tied to your identity. Do Not
Track and Global Privacy Control are honoured, and a button on the page
turns counting off entirely.

## Development

```sh
node --test
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The safe-harbor
arithmetic, the holiday-adjusted due-date engine (regression-tested against
three real IRS deadline shifts), and the `.ics` export are done and tested;
no external user contact has happened yet — see `kill_criteria` in
`VENTURE.yaml`.
