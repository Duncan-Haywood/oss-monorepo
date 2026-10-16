# Pour Cost Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/pour-cost-calculator/>

A free browser tool that prices a cocktail recipe from its own bottle costs
and pour sizes, reports the pour cost (liquor cost) percentage against a
target the operator sets, and shows what a stated over-pour is really costing
across a year of shifts. Nothing is uploaded; the arithmetic runs on the
visitor's own device.

```
cd ventures/pour-cost-calculator && node --test "*.test.mjs"
```

Open `index.html` in a browser to use it — there is no build step.

## Why it exists

"Pour cost" — liquor cost as a percentage of menu price — is the standard way
a bar or restaurant beverage program checks whether a drink is priced to do
its job, the way food cost percentage works for a kitchen. Bars commonly
target 18–24% for spirits. The number is simple arithmetic, but almost nobody
actually computes it per recipe: it lives in a spreadsheet that goes stale the
moment a supplier's price changes, or it doesn't get computed at all and the
menu price is set by feel.

Two things this tool computes that a flat percentage assumption misses:

**The recipe's real pour cost, from real bottle costs.** A well vodka bought
at a different price, or a recipe that pours a quarter-ounce more than last
time, moves the true number without moving anything on the menu. Cost per
ounce is `bottle cost ÷ bottle size in ounces`; ingredient cost is that times
the ounces used; pour cost is ingredient cost over menu price.

**What a small over-pour costs across real volume.** A bartender pouring
0.25oz over a 1.5oz recipe looks generous on any single ticket — a few cents.
Multiplied across a week's worth of drinks and 52 weeks, it is real,
recoverable money that never appears as a line item anywhere, because it left
the bottle without ever touching a price. This is the number that makes the
arithmetic worth returning to: a few cents a drink is easy to dismiss, and a
few hundred or thousand dollars a year is not.

## What it does not do

It is not an inventory system, a POS integration, or a recipe database — it
prices one recipe at a time from numbers typed in by hand. It has no opinion
on what to charge, how to run a beverage program, staffing, or any
alcohol-service or pour-size law in any jurisdiction. It does not audit a
bartender or assign blame for an over-pour; the annual-cost figure is a
pricing observation, phrased as arithmetic on a stated number, not an
accusation.

## Files

| File | What it is |
|---|---|
| `calc.mjs` | The arithmetic. Pure, no DOM. |
| `usage.mjs` | Anonymous, device-local event counts. |
| `index.html` | The calculator. |
| `how-to-calculate-pour-cost.html` | The search-intent page with the formula, a worked example, and an `FAQPage` node. |

## Privacy

Everything runs in your browser. Your bottle costs, recipes, menu prices, and
drink counts are never uploaded and never appear in a usage count — those are
anonymous tallies of which features were used, stored locally. We don't have
accounts, tracking cookies, or an analytics vendor.

## Disclaimer

This free tool is not legal, tax, accounting, insurance, alcohol-service, or
financial advice, and it does not tell you what to charge, how to run your
beverage program, or what any pour-size or service law in your jurisdiction
requires. It is arithmetic on the numbers you type. Verify every figure
against your own invoices, POS reports, and accounts, and against a qualified
professional, before relying on it or pricing a menu with it. To the maximum
extent permitted by law, the authors accept no liability for any loss or
damage arising from its use.

**Best-effort hosting, no SLA.** This tool is free, experimental, and may be
slow, broken, moved, or taken offline without notice. Do not use it as a
system of record.

MIT licensed — see [`LICENSE`](LICENSE).

## Distribution

No paid acquisition. The intended channels are r/bartenders and r/TendingBar
(bar-industry subreddits where recipe costing and pour-cost questions are a
recurring topic), and the search phrases "pour cost calculator", "liquor cost
calculator", and "how to calculate pour cost" — all with existing commercial
and blog-embedded calculators, but none free-standing, private, and scoped to
a specific over-pour cost check the way this one is. Unmeasured until the tool
is live and discoverable in the apex catalogue's sitemap.
