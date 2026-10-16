# Backdoor Roth Pro-Rata Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/backdoor-roth-pro-rata-calculator/>

A free browser calculator for the Form 8606 pro-rata rule. Entirely
client-side; nothing is uploaded.

After using this, you can now **see how much of your backdoor Roth
conversion is actually taxable, and what a 401(k) roll-in before December 31
would save** — which used to mean working Form 8606 Part I by hand and
discovering the bill when you filed.

## Why this exists

The IRS treats every traditional, SEP and SIMPLE IRA you own as one pot,
measured on December 31. Converting to Roth, the tax-free share is your
total after-tax basis divided by that pot plus the conversion. An old
rollover IRA therefore turns a "free" backdoor conversion into a taxable
one. Money in an employer 401(k) or Solo 401(k) is not counted, so rolling
pre-tax IRA money in before year-end restores a 100% tax-free ratio.

The 2026 IRA contribution limit is $7,500 ($8,600 with the $1,100 age-50
catch-up), verified against IRS.gov's 2026 limits announcement (Notice
2025-67).

## Try it

Open [`index.html`](index.html), enter the conversion, basis and December 31
IRA total, then click **Calculate**.

## What it calculates

All in [`calc.mjs`](calc.mjs), as pure functions with no dependencies:

- **`proRata`** — Form 8606 Part I lines 1-15: ratio, nontaxable and taxable
  conversion, taxable ordinary distributions, basis carried forward.
- **`backdoorRothOutcome`** — the page's full answer: the above, the same
  filer with no pre-tax IRA money on December 31, the tax at a marginal
  rate, the avoidable part, and findings (excess-contribution warning,
  Form 8606 reminder).
- **`iraLimitFor`** — the 2026 IRA contribution limit for an age.

## What this does not cover

- Federal tax only; state treatment varies.
- Form 8606 line 4 (next-year contributions counted for this year),
  inherited IRAs and prior-year basis distributions.
- Flat marginal rate; no bracket-crossing, Medicare or credit effects.
- Roth income limits and the 5-year rule.
- Point-in-time 2026 figures.

## Disclaimers

Not legal, tax, or financial advice. It does not replace the Form 8606
instructions or a qualified tax professional.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy

Everything runs in your browser. Nothing you enter is uploaded. Anonymous
feature events (`conversion_calculated`, `example_loaded`) are counted in
`localStorage` only. Do Not Track and Global Privacy Control are honoured,
and a button on the page turns counting off.

## Development

```sh
node --test
```
