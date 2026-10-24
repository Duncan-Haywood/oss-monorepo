# HSA Contribution Limit Calculator

A free browser calculator for the 2026 HSA (Health Savings Account)
contribution limit. Entirely client-side; nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/hsa-contribution-limit-calculator/

After using this, you can now **see how much you can contribute to your
HSA in 2026, prorated for partial-year HDHP eligibility or the full
amount under the last-month rule** — which used to mean cross-referencing
a benefits blog's table against your own coverage months by hand.

## Why this exists

Verified via WebSearch on 2026-09-25 against Fidelity's "HSA contribution
limits and eligibility rules for 2026 and 2027", Thomson Reuters Tax's "IRS
Announces 2026 HSA and EBHRA Contribution Limits, HDHP Minimum Deductibles,
and HDHP Out-of-Pocket Maximums", Mercer's "2026 HSA, HDHP and
excepted-benefit HRA figures set", and IRS Rev. Proc. 2025-19:

- **The 2026 HSA contribution limit is $4,400 self-only or $8,750
  family**, plus a **$1,000 age-55 catch-up** fixed by statute (not
  inflation-indexed, unlike the base limits).
- **2026 HDHP qualification bounds**: deductible at least $1,700
  self-only / $3,400 family; out-of-pocket maximum no more than $8,500
  self-only / $17,000 family.
- **Partial-year eligibility is normally prorated by whole months** —
  annual limit x eligible months / 12.
- **The last-month rule** lets someone HSA-eligible on December 1 of the
  tax year contribute the full annual limit regardless of when eligibility
  started, in exchange for a testing period through December 31 of the
  following year — lapsing eligibility before then (other than by death or
  disability) makes the excess taxable plus a 10% additional tax.

## Try it

Open [`index.html`](index.html). Choose coverage type, months of HDHP
eligibility, and whether the age-55 catch-up or last-month rule applies,
then click **Calculate**. Optionally enter your plan's deductible and
out-of-pocket maximum to check HDHP qualification too.

## What it calculates

All in [`calc.mjs`](calc.mjs), as pure functions with no dependencies:

- **`contributionLimitOutcome`** — the 2026 contribution limit for the
  entered coverage type, eligible months (prorated) or the last-month
  rule (full limit), and the age-55 catch-up.
- **`hdhpQualifies`** — whether a plan's deductible and out-of-pocket
  maximum satisfy the 2026 HDHP-qualification bounds.

## What this does not cover

- Not a full eligibility determination — does not check for other
  disqualifying coverage (a general-purpose FSA, Medicare enrollment,
  being claimed as a dependent, or a spouse's non-HDHP plan).
- The family limit is a household total; this tool does not split it
  between two spouses' HSAs.
- The catch-up cannot go into a spouse's HSA; a 55+ spouse needs their
  own account.
- Point-in-time 2026 figures; the base limits re-index annually.

## Disclaimers

Not legal, tax, or financial advice. This applies published 2026 IRS
figures to the numbers you enter; it is not a substitute for IRS
Publication 969 or a qualified tax professional.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy

Everything runs in your browser. The numbers you enter are **never
uploaded** — there is no server component at all. Anonymous feature events
(`limit_calculated`, `example_loaded`) are counted in `localStorage` only,
never transmitted. Do Not Track and Global Privacy Control are honoured,
and a button on the page turns counting off entirely.

## Development

```sh
node --test
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The calculator and its
test suite are done; no external user contact has happened yet — see
`kill_criteria` in `VENTURE.yaml`.

## Related

Before paying a medical bill from an HSA, check it with [`medical-bill-error-checker`](../medical-bill-error-checker/): it reads an itemized bill in the browser, nothing uploaded.
