# Trump Account Calculator

A free browser calculator for the federal "Trump Account" child savings
account, created by the One Big Beautiful Bill Act (26 U.S.C. 530A).
Entirely client-side; nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/trump-account-calculator/

After using this, you can now **project a Trump Account's balance to age 18
or later, and see exactly how much of a withdrawal is tax-free versus
taxable under the IRA-style pro-rata basis rule** — the mechanic almost
every comparison to a 529 plan gets backwards, and which otherwise means
reading several CPA-firm explainers and hoping you applied the basis
tracking correctly.

## Why this exists

Trump Accounts are new for 2025-2026 and are being widely searched right
now ("trump account calculator", "how much will a trump account be worth",
"trump account vs 529") as parents open accounts for children born
2025-2028 and evaluate whether to contribute. It has several genuinely
easy-to-miss mechanics, verified via WebSearch on 2026-09-24 against
Ameriprise Financial, Sikich, BDO's summary of the IRS's initial guidance,
Surgent CPE, Alloy Silverstein, the Journal of Accountancy's and The Tax
Adviser's coverage of the proposed section 128 employer-contribution
regulations, Mercer Advisors, Seyfarth Shaw, the Treasury Department's own
press release on employer contributions, and TaxSharkInc's worked
withdrawal examples:

- **The pro-rata withdrawal rule is not "basis first."** Only money
  contributed by an individual (parent, grandparent, or other person) is
  basis and comes out tax-free. The one-time $1,000 federal seed deposit,
  any employer contribution, and every dollar of investment growth create
  NO basis — every withdrawal is part tax-free and part taxable, in the
  same ratio as basis is to the total account value, for as long as the
  account holds money.
- **The $2,500 employer contribution limit is inside, not on top of, the
  $5,000 annual cap.** An employer's contribution and everyone else's
  contributions share one ceiling.
- **No distribution of any kind is allowed before age 18** — not even of
  the family's own contributions — and the account is then taxed like a
  traditional IRA, with a 10% early-withdrawal penalty before age 59.5
  unless the withdrawal is for a recognized use (qualified education, a
  first home, disability, and similar).

## Try it

Open [`index.html`](index.html). Enter the child's starting age, the
withdrawal age, whether the $1,000 seed applies, the annual family and
employer contributions, an assumed return, and a marginal tax rate. Click
**Calculate**.

## What it calculates

All in [`calc.mjs`](calc.mjs), as pure functions with no dependencies:

- **`projectTrumpAccount`** — compounds the seed deposit and annual
  contributions to the chosen withdrawal age, tracks basis (family
  contributions) separately from non-basis money (seed + employer), and
  applies the pro-rata tax-free/taxable split plus the early-withdrawal
  penalty logic.
- **`clipAnnualContributions`** — applies the $2,500 employer sub-cap and
  the shared $5,000 total cap to whatever is entered.

## What this does not cover

- Not a full tax return — no other deductions, credits, or state tax
  (most states have not yet ruled on their own treatment of a Trump
  Account).
- Citizenship and birth year are self-reported by the user, not verified
  here.
- The $5,000 annual cap is applied flat to every projected year; by statute
  it is indexed upward in $100 increments starting 2028, so this
  understates future room, never overstates it.
- Assumes a single, full withdrawal at the chosen age rather than a series
  of partial ones.

## Disclaimers

Not legal, tax, or financial advice. This applies the published federal
seed-deposit rule, contribution caps, and pro-rata withdrawal formula to
the numbers you enter; it is not a substitute for reviewing IRS guidance or
consulting a qualified tax professional.

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
