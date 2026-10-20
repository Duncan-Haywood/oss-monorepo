# Gambling Loss Deduction Calculator

A free browser calculator for the OBBBA gambling-loss deduction limitation.
Entirely client-side; nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/gambling-loss-deduction-calculator/

After using this, you can now **see your allowable gambling-loss deduction
under the new 90%-of-winnings cap and the exact taxable "phantom income" it
creates even if you broke even or lost overall** — which used to take
reading a CPA-firm explainer and doing the two-cap arithmetic by hand.

## Why this exists

The One Big Beautiful Bill Act (OBBBA, signed July 4, 2025) amended IRC
Section 165(d) for tax years beginning after December 31, 2025. Verified
via WebSearch on 2026-09-25 against Porte Brown's "Gambling Loss Deductions
Narrow Under the OBBBA Starting in 2026", Barnes Dennig's "Major Changes to
Gambling Loss Deductions Under the OBBBA", Beancount's "26 USC 165(d): OBBBA
90% Gambling Loss Cap Creates Phantom Income", National Tax Tools' "Gambling
Loss Deduction Guide 2026 (and 2025)", the NATP's "Will the OBBBA gambling
deduction change be reversed?", and Monaco CPA's "90% Gambling Loss Cap
2026: Phantom Income Explained":

- **The allowable deduction is the lesser of actual losses or 90% of
  winnings** — on top of, not instead of, the pre-existing rule that losses
  are never deductible beyond winnings at all.
- **This creates "phantom income."** Once losses are at least 90% of
  winnings — a break-even or net-losing year — the deduction is capped at
  exactly 90% of winnings, leaving 10% of winnings taxable no matter how
  much more was actually lost. The disallowed 10% does not carry forward.
- **It is permanent law, with no scheduled sunset** — unlike several other
  OBBBA individual provisions (the SALT cap increase, the tips/overtime
  deductions) that expire after 2028 or 2029. Repeal bills have been
  introduced but none had passed as of this tool's last fact-check.
- **Only itemizers can claim any deduction at all** — a pre-existing rule,
  unaffected by OBBBA.
- **Professional gamblers are not exempt.** OBBBA permanently folded a
  professional's trade-or-business wagering expenses into this same
  limitation, a TCJA rule that was otherwise set to expire after 2025.

## Try it

Open [`index.html`](index.html). Enter your winnings and losses, tick
whether you itemize and whether you gamble professionally, and click
**Calculate**.

## What it calculates

All in [`calc.mjs`](calc.mjs), as pure functions with no dependencies:

- **`gamblingLossOutcome`** — applies the 90%-of-winnings cap (for 2026+),
  the pre-existing winnings cap, the itemizing requirement, and reports the
  resulting deduction, taxable gambling income, and phantom income.

## What this does not cover

- Not a full tax return — no other itemized deductions, whether itemizing
  beats the standard deduction, other credits, or state tax treatment.
- Does not verify your winnings or losses against any record (W-2G,
  session log, etc.) — you supply both figures directly.
- No state-by-state modeling; several states disallow the federal
  gambling-loss deduction entirely at the state level.
- Repeal is not modeled — this applies current law only.

## Disclaimers

Not legal, tax, or financial advice. This applies a published federal
statutory formula to the numbers you enter; it is not a substitute for
reviewing IRS guidance or consulting a qualified tax professional.

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
