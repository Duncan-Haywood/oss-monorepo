# Charitable Deduction Calculator

A free browser calculator comparing two 2026 charitable-giving deduction
paths under the One Big Beautiful Bill Act: the new above-the-line
deduction for non-itemizers, and itemizing cash gifts after the new
0.5%-of-AGI floor. Entirely client-side; nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/charitable-deduction-calculator/

After using this, you can now **see the deductible amount under both
paths for your own AGI and giving, and which one nets more** — which used
to take reading a CPA-firm explainer and doing the floor/ceiling
arithmetic by hand.

## Why this exists

The One Big Beautiful Bill Act (OBBBA, signed July 4, 2025) changes how
charitable giving is deducted starting with the 2026 tax year. Verified via
WebSearch on 2026-09-25 against Instead's "Charitable deductions return for
non-itemizers in 2026", TheStreet's coverage of Vanguard's write-up on the
$1,000 charitable write-off, Tax Foundation's "Changes to Charitable Giving
Under the One Big Beautiful Bill Act", Taft Law's "Charitable Giving After
the OBBBA: The 2026 Outlook", and cross-check searches confirming the exact
IRC 170(p) filing-status breakdown and the permanent 60%-of-AGI ceiling:

- **Non-itemizers get a new above-the-line deduction** for cash gifts to
  public charities — $1,000 single/head-of-household/married-filing-
  separately, $2,000 married filing jointly. It reduces AGI directly, even
  while taking the standard deduction. Cash only, no donor-advised funds,
  no carryforward.
- **Itemizers face a new, permanent 0.5%-of-AGI floor** starting in 2026 —
  the first slice of charitable giving up to that floor produces no
  itemized benefit at all. It does not apply to the non-itemizer path.
- **The existing 60%-of-AGI ceiling on cash gifts is now permanent**
  (it was a TCJA-era increase from 50% that had been scheduled to
  revert at the end of 2025).
- **A separate, much larger change** caps the tax value of ALL itemized
  deductions combined at 35 cents per dollar for the top (37%) bracket —
  out of scope here, since it needs a complete itemized-deduction total,
  not just charitable giving.

## Try it

Open [`index.html`](index.html). Enter your filing status, AGI, and cash
giving to public charities. Click **Calculate**.

## What it calculates

All in [`calc.mjs`](calc.mjs), as pure functions with no dependencies:

- **`charitableDeductionOutcome`** — the non-itemizer deduction (capped by
  filing status), the itemized deduction (capped at 60% of AGI, then the
  0.5%-of-AGI floor subtracted), and which path nets more.

## What this does not cover

- Not a full tax return — no other itemized deductions, whether itemizing
  beats the standard deduction overall, other credits, or state tax.
- No top-bracket itemized-deduction limitation (the 35-cents-per-dollar
  cap for the 37% bracket).
- Cash gifts to public charities only — no donor-advised funds, no
  appreciated property (separately limited to 30% of AGI).
- No carryforward modeling for cash gifts disallowed by the 60% ceiling.

## Disclaimers

Not legal, tax, or financial advice. This applies published federal
charitable-deduction rules to the numbers you enter; it is not a
substitute for reviewing IRS guidance or consulting a qualified tax
professional.

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
