# Estate Tax Exemption Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/estate-tax-exemption-calculator/>

A free browser calculator for the One Big Beautiful Bill Act's permanent
2026 federal estate, gift, and generation-skipping transfer (GST) tax basic
exclusion amount — $15,000,000 per person, up to $30,000,000 for a married
couple who elects portability. Entirely client-side; nothing is uploaded.

After using this, you can now **project your federal estate tax exposure
under the 2026 exclusion, with your own prior taxable gifts and any
portability election factored in** — which used to take reading a law-firm
client alert and doing the unified-credit arithmetic by hand.

## Why this exists

The One Big Beautiful Bill Act (OBBBA, signed July 4, 2025) permanently set
the 2026 federal estate/gift/GST exclusion at $15,000,000, cancelling a
widely publicized scheduled reversion to roughly $7,000,000. Verified via
WebSearch on 2026-09-25 against the IRS's own newsroom release "IRS
releases tax inflation adjustments for tax year 2026, including amendments
from the One, Big, Beautiful Bill" (irs.gov), Morgan Lewis's "IRS Announces
Increased Gift and Estate Tax Exemption Amounts for 2026", Spencer Fane's
"Updated Inflation Adjustments for Gift Tax Annual Exclusion, Unified
Credit Amount, and GST Tax Exemption for 2026", Bowditch & Dewey's "Big
Increase in 2026 Federal Estate Exemption", and Haynes Boone's "Federal
Estate, Gift and GST Tax Highlights from the One Big Beautiful Bill Act":

- **The basic exclusion amount (IRC 2010(c)) is $15,000,000 per person**
  for 2026, permanent, with no scheduled expiration — indexed for
  inflation starting in 2027.
- **Portability (DSUE) lets a surviving spouse add a deceased spouse's
  unused exclusion** to their own, by timely electing it on Form 706 —
  it is not automatic just for being married.
- **The GST exemption was also raised to $15,000,000, but it is NOT
  portable between spouses** — unlike the estate/gift exclusion. This is
  the detail most consumer-facing explainers get backwards or omit.
- **Lifetime taxable gifts reduce the exclusion available at death** —
  estate and gift tax share one unified exclusion, not two.
- **The federal estate tax rate above the exclusion is a flat 40%.**
- **The 2026 annual gift-tax exclusion is $19,000 per recipient**,
  unchanged from 2025.

## Try it

Open [`index.html`](index.html). Enter your filing situation, gross estate,
prior taxable gifts, and any DSUE elected. Click **Calculate**.

## What it calculates

All in [`calc.mjs`](calc.mjs), as pure functions with no dependencies:

- **`estateTaxOutcome`** — the total available exclusion (own exclusion
  plus any DSUE), the exclusion remaining after prior taxable gifts, the
  resulting taxable estate, and the estimated federal tax at the flat 40%
  rate.

## What this does not cover

- Federal tax only — state estate/inheritance tax follows separate,
  often much lower thresholds and is not modeled.
- No marital or charitable deduction, and no valuation discounts.
- Not a filed Form 706 or Form 709 — a planning estimate only.

## Disclaimers

Not legal, tax, or financial advice. This applies published federal
estate, gift, and GST tax exclusion rules to the numbers you enter; it is
not a substitute for consulting a qualified estate planning attorney or
CPA before you act.

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
