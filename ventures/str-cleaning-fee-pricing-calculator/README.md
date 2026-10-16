# Short-Term Rental Cleaning Fee Calculator

A free browser calculator for Airbnb and VRBO hosts: **charge a separate
cleaning fee, or roll it into the nightly rate?** Entirely client-side;
nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/str-cleaning-fee-pricing-calculator/

After using this, you can now **see your profit on 1 to 14 night stays under
each structure, the fee that actually covers your cleaner after platform fees,
and the shortest stay that makes money**, which used to mean a spreadsheet.

## Inputs

Nightly rate, current cleaning fee, cleaner's cost per turnover, average stay,
platform host fee, guest service fee, variable cost per night, booked nights
per month.

## Outputs

Break-even cleaning fee `cost / (1 - host fee)`; rolled-in nightly rate
`nightly + fee / average stay`; guest all-in price and host profit by stay
length for both structures; shortest profitable stay; monthly cleaning-fee net.

## The model (stated so you can disagree with it)

- Separate: revenue = n x nightly + fee. Rolled in: n x (nightly + fee/avg).
  Identical at the average stay by construction.
- Host payout = revenue x (1 - host fee); profit = payout - cleaner - n x
  night cost. Linear in n, so the minimum profitable stay is exact; tests
  check it.

## What this does not cover

Demand response to displayed price, taxes, weekly/monthly discounts, pet or
extra-guest fees, damage, your own cleaning time, and platform rules that
vary by region or change.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not legal, tax, or financial advice, and it
does not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it.** To the maximum
extent permitted by law, the authors accept no liability for any loss or
damage arising from its use.

## Privacy

Everything runs in your browser. Inputs are never uploaded. Anonymous feature
counts live only in local storage and can be turned off on the page.

## Run

Static ES modules, no build step: open `index.html`, or `node --test`.
MIT licensed; support is optional via GitHub Sponsors.
