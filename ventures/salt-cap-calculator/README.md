# SALT Deduction Cap Calculator

A free browser calculator for the SALT (state and local tax) itemized
deduction cap under the One Big Beautiful Bill Act. Entirely client-side;
nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/salt-cap-calculator/

After using this, you can now **see your effective SALT deduction cap after
the 2025/2026 MAGI-based phase-out, the resulting deductible amount, and the
exact MAGI at which the cap floors out completely** — which used to take
reading a CPA-firm explainer and doing the phase-out arithmetic by hand.

## Why this exists

The One Big Beautiful Bill Act (OBBBA, signed July 4, 2025) temporarily
raised the SALT deduction cap for 2025 through 2029. Verified via WebSearch
on 2026-09-25 against The Tax Adviser's "Cap raised, strings attached: The
2025 SALT shake-up", TaxAct's "SALT Tax Deduction 2025", Fidelity's "How the
new SALT deduction cap could affect your taxes", KahnLitwin's "SALT
Deduction Raised to $40,000 — But a Hidden Phaseout Could Cost You", Anchin's
"SALT Deduction Cap Under OBBBA", KMK Ventures' "SALT Tax Deduction
2025-2026", TaxSharkInc's "How Does the SALT Cap Phase Out Above $500,000?",
and Ourtaxpartner's "New SALT Deduction Caps":

- **The cap went from $10,000 to $40,000 for 2025** ($5,000 to $20,000
  married filing separately), increasing 1% per year through 2029 —
  $40,400/$20,200 for 2026. It reverts to $10,000/$5,000 in 2030 unless
  Congress acts again.
- **Single, head-of-household, and married-filing-jointly filers share the
  same cap and threshold** — a joint return does not get double the single
  amount. Only married filing separately gets a different, exactly-halved
  figure.
- **The phase-out is 30 cents per dollar of MAGI above the threshold**
  ($500,000/$505,000, half for MFS) — reducing the CAP, not the amount of
  tax paid.
- **The cap can never drop below its permanent-law floor** — $10,000
  ($5,000 MFS), the same amount every itemizing filer had before OBBBA.
  This is not a full phase-out to zero.
- **A pass-through entity tax (PTET) election can bypass this cap entirely**
  for a partnership or S corporation owner's share of state tax paid at the
  entity level — not modeled here.

## Try it

Open [`index.html`](index.html). Enter your filing status, tax year, MAGI,
and state and local taxes paid. Click **Calculate**.

## What it calculates

All in [`calc.mjs`](calc.mjs), as pure functions with no dependencies:

- **`saltCapOutcome`** — applies the year's cap, threshold, and 30%
  phase-out for the given filing status, floors the result, and computes
  the deductible and non-deductible amount for taxes actually paid.
- **`magiAtFloor`** — the exact MAGI at which the phase-out alone reaches
  the permanent-law floor.

## What this does not cover

- Not a full tax return — no other itemized deductions, whether itemizing
  beats the standard deduction, other credits, AMT, or state tax.
- Does not compute MAGI from wages, business income, or other add-backs —
  you supply it directly.
- No pass-through entity tax (PTET) election modeling.
- 2025 and 2026 only; the cap's further 1% annual increases through 2029
  and its 2030 reversion are out of scope.

## Disclaimers

Not legal, tax, or financial advice. This applies published federal
SALT-cap and phase-out rules to the numbers you enter; it is not a
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
