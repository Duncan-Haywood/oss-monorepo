# Driving Instructor Lesson Pricing Calculator

A free browser calculator for independent driving instructors (ADIs and
behind-the-wheel or driver-ed instructors who own their car): profit per
lesson, break-even price, the price that reaches a take-home target, and the
effect of a block-booking discount, after fuel, wear, fixed car costs,
unpaid gaps and cancellations. Entirely client-side; nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/driving-instructor-lesson-pricing-calculator/

## Why this exists

Lesson prices are usually set by looking at what other instructors charge.
The real cost of a lesson is the fuel and wear of the miles driven to
collect and drop the pupil, a car whose fixed yearly cost is paid whether or
not lessons happen, and the unpaid gap between pupils. Cancellations raise
every one of those per paid lesson. This shows the number.

## Try it

Open [`index.html`](index.html), enter a lesson price, slots per week, miles
per lesson, mpg and fuel price, then click **Calculate**.

## What it calculates

In [`calc.mjs`](calc.mjs), as pure functions with no dependencies:

- **`priceLessons`** — paid lessons, revenue, running and fixed cost per
  paid lesson, profit per lesson and per diary hour, annual profit before
  tax, the break-even price, the price that reaches a profit target, and an
  optional block-discount check, with findings.
- **`formatPricingSummary`** — the same result as plain text, with the
  disclaimer.

## Disclaimers

Arithmetic on the numbers entered, for one working year. Profit is before
income tax and self-employment tax. It is not tax, legal, or financial
advice.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy

Everything runs in your browser. Numbers are **never uploaded**. Anonymous
feature events (`pricing_calculated`, `summary_copied`, `example_loaded`) are
counted in `localStorage` only. Do Not Track and Global Privacy Control are
honoured, and a button turns counting off.

## Development

```sh
node --test calc.test.mjs usage.test.mjs page.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml).
