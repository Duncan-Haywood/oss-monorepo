# Bail Bond Agency Exposure Calculator

A free browser tool for bail bond agents and small agencies. Type the open bonds, the collateral held and your surety's terms; it shows what the
book nets after the surety's share and the build-up fund, what it owes if bonds are forfeited, whether cash covers the largest ones, and a
court-date call list. Entirely client-side; nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/bail-bond-agency-exposure-calculator/

After using this, you can now **see in dollars how much of your open book is uncollateralized, whether your cash would survive the largest
forfeiture, and who to call this week**, which used to mean a spreadsheet kept by hand.

## What it calculates

- Premium = bond amount x rate (default or per bond); net = premium - surety share - build-up fund (held until exoneration).
- Loss if a bond is forfeited = (bond amount - collateral) x (1 - recovery %). Expected loss = total loss x expected failure-to-appear rate.
- Break-even failure-to-appear rate = net premium / total loss if everything forfeited.
- Cash coverage = reserve + build-up fund, spent against the largest losses first; shortfall if all go bad.
- Writing-limit use, concentration in one bond, court dates inside the window, and dates already past on bonds still listed open.

No premium schedule, forfeiture deadline or licensing rule ships; the user types their own terms.

## Run it

Open [`index.html`](index.html). Tests: `node --test 'ventures/bail-bond-agency-exposure-calculator/*.test.mjs'`.

Not legal, tax, or financial advice. See the page for the full disclaimer.
