# Wedding Budget Allocator

A free browser tool that splits a wedding budget across 14 categories using guest
count, region, season and up to three priorities. Entirely client-side; nothing is
uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/wedding-budget-allocator/

After using this, you can now **see where a total budget should go, what each extra
guest costs, and how many guests make a tight budget realistic**, which used to mean
one fixed percentage chart that ignores guest count.

## Model

- Typical cost = baseline x region multiplier x season multiplier (venue, food, flowers)
  x guests (per-guest lines: food, bar, rentals, cake, stationery).
- 7% of the budget is held as contingency.
- The rest is split by weighted typical cost (priorities weighted 1.35x), each line held
  between 45% and 160% of typical cost, surplus or shortfall redistributed.
- A tight budget gets the guest count that reaches 85% of typical cost.

## What this does not cover

Venues bundling food and rentals, cultural or religious costs, destination weddings,
taxes and service charges, honeymoon and rehearsal events. Baselines are ballpark
figures, not quotes.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind,
express or implied. It is not legal, tax, or financial advice. **You are responsible for
reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from
its use.

## Privacy

Everything runs in your browser. Inputs are never uploaded. Anonymous feature counts
live only in local storage and can be turned off on the page.

## Run

Static ES modules, no build step: open `index.html`, or `node --test`.
MIT licensed; support is optional via GitHub Sponsors.
