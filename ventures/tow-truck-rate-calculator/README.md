# Tow Truck Rate Calculator

A free browser calculator for independent towing and roadside operators: **a defensible
price per tow job from your own costs.** Entirely client-side; nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/tow-truck-rate-calculator/

After using this, you can now **see the true cost of a tow (including the empty deadhead
drive), your margin at the price you charge, the break-even price, the price for your
target margin, and which lever adds the most profit**, which used to mean guessing from
what the last operator charged.

## Inputs

Truck payment, insurance, driver cost, billable hours, fuel price, mpg and wear per mile;
loaded and deadhead miles, speed and on-scene minutes; hook-up fee, included miles,
per-mile rate, after-hours, weather and winch surcharges; storage days, daily fee and
your cost per storage day; target margin.

## Formulas

- Truck hourly cost = (payment + insurance) / billable hours + driver cost per hour
- Per-mile cost = fuel price / mpg + wear per mile
- True cost = job hours x hourly cost + (deadhead + loaded miles) x per-mile cost + storage cost
- Price = hook-up + (loaded miles - included) x rate + surcharges + storage fees
- Break-even = true cost; target price = true cost / (1 - target margin)
- Levers are fixed-size steps (hook-up +$10, rate +$0.50/mile, 25% less deadhead, 10 minutes
  saved, storage fee +$5/day) ranked by profit added

## What this does not cover

Idle time between jobs, tolls, impound lot and gate fees, special equipment, motor-club
payout schedules, taxes, and any rate cap. Many states and municipalities regulate tow
rates, storage fees, rotation lists and private-property tows; check yours.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind,
express or implied. It is not legal, tax, or financial advice, and it does not replace
a qualified professional. **You are responsible for reviewing and verifying its output
before relying on it.** To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

## Privacy

Everything runs in your browser. Inputs are never uploaded. Anonymous feature counts
live only in local storage and can be turned off on the page.

## Run

Static ES modules, no build step: open `index.html`, or `node --test`.
MIT licensed; support is optional via GitHub Sponsors.
