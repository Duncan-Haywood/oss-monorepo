# Senior Deduction Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/senior-deduction-calculator/>

A free browser calculator for the new federal "senior bonus" deduction,
enacted by the One Big Beautiful Bill Act for tax years 2025 through 2028.
Entirely client-side; nothing is uploaded.

After using this, you can now **turn "I'm 65 (or my spouse is)" into an
estimated federal deduction and rough tax savings in seconds, including the
two things people get backwards: married filing separately gets nothing at
all, and two qualifying spouses phase out at the SAME income as one** —
arithmetic that otherwise means reading a dense CPA-firm explainer and hoping
you applied the phase-out correctly per person.

## Why this exists

This deduction is new for the 2025 tax year and is being widely searched
right now ("senior deduction calculator", "$6000 senior tax deduction 2025",
"new senior tax break 65") as the first tax season under it approaches. It
has mechanics genuinely easy to get wrong, both verified via WebSearch on
2026-09-24 against Kiplinger, H&R Block, Thomson Reuters Tax & Accounting,
CNBC, TurboTax, and several independent CPA-firm summaries, cross-checked
against each other:

- **Married filing separately gets nothing** — not a reduced amount, zero,
  regardless of age or income. A married couple must file jointly for either
  spouse to claim any of it. This is the same direction as this portfolio's
  own
  [`no-tax-on-tips-overtime-calculator`](../no-tax-on-tips-overtime-calculator/)
  and the opposite of its
  [`auto-loan-interest-deduction-calculator`](../auto-loan-interest-deduction-calculator/),
  which explicitly allows MFS with its own cap — a visitor who used that
  calculator first would reasonably assume this one works the same way, and
  it doesn't.
- **Two qualifying spouses phase out at the same MAGI as one.** Each
  spouse's own $6,000 is reduced independently by 6 cents per dollar of the
  *same* household MAGI excess, so the combined deduction reaches exactly $0
  at $250,000 joint MAGI whether one spouse qualifies or both — it is not
  the case that having a second qualifying senior on the return buys extra
  phase-out room.
- **It stacks on the standard deduction**, unlike an itemized deduction — a
  filer who takes the standard deduction still gets this on top of it.
- **It's temporary.** Tax years 2025 through 2028 only, under current law.

## Try it

Open [`index.html`](index.html). Enter filing status, estimated MAGI, and a
marginal tax rate; check the box for yourself (and your spouse, on a joint
return) if 65 or older with a valid Social Security number. Click
**Calculate**.

## What it calculates

All in [`calc.mjs`](calc.mjs), as pure functions with no dependencies:

- **`computeSeniorDeduction`** — applies the per-person $6,000 amount, the
  MAGI phase-out, the married-filing-separately exclusion, and counts
  qualifying people (0, 1, or 2 on a joint return). Any disqualifying
  condition (MFS, or nobody marked as qualifying) zeroes the deduction and
  names itself in the findings, rather than silently returning $0.
- **`perPersonReduction`** / **`perPersonDeduction`** — a continuous 6% of
  MAGI over the threshold, clamped so it never exceeds the $6,000 it would
  reduce to zero.
- **`estimateTaxSavings`** — the deduction times a user-chosen marginal
  rate, clearly labelled as a rough estimate, not a full return.

## What this does not cover

- Not a full tax return — no other deductions, credits, or state tax.
- Age and Social Security number are self-reported by the user, not
  verified against any external source.
- Not the pre-existing "extra standard deduction for age 65+" that has
  applied for years — this is a separate, additional, temporary deduction on
  top of it.
- Does not affect Social Security's own taxation rules or payroll (FICA/SECA)
  tax, and most states still tax the same income unless that state
  separately conforms.

## Disclaimers

Not legal, tax, or financial advice. This applies the published statutory
amount, phase-out formula, and eligibility rules to the numbers and
checkboxes you enter; it is not a substitute for reviewing IRS guidance or
consulting a qualified tax professional before filing.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy

Everything runs in your browser. The numbers you enter are **never
uploaded** — there is no server component at all. Anonymous feature events
(`estimate_calculated`, `example_loaded`) are counted in `localStorage`
only, never transmitted. Do Not Track and Global Privacy Control are
honoured, and a button on the page turns counting off entirely.

## Development

```sh
node --test
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The calculator and its
test suite are done; no external user contact has happened yet — see
`kill_criteria` in `VENTURE.yaml`.
