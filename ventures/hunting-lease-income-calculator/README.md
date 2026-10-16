# Hunting Lease Income Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/hunting-lease-income-calculator/>

A free browser tool (and small Node CLI) for landowners: **enter your acres, the prices you are offered and your own
costs, and see what a flat club lease, per-hunter seasonal leases and paid day hunts would each net.** It also gives
the break-even rate per acre and shows how net moves if only some hunter seats fill. Nothing is uploaded.

After using this, you can now **tell which way of leasing your land nets the most after insurance, upkeep and lost use**,
which used to mean guessing from a neighbour's per-acre number.

## Use

1. Open `index.html`, fill in the numbers (or Load an example), click Compare.
2. CLI: `node cli.mjs --acres 200 --rate 12 --hunters 6 --hunter-fee 600 --fill 80 --day-rate 150 --days 14 --insurance 350 [--json]`
   (exit 1 when no arrangement has positive net).

## Rules

- Club = acres x rate. Per-hunter = seats x fill x fee. Day hunts = hunter-days x day rate.
- Net = gross + tax savings - insurance - upkeep - admin - lost use - platform fee.
- Break-even rate = (costs - tax savings) / (1 - platform fee) / acres.
- The tool holds no market data; every price and cost is yours.

Not modelled: liability and its legal limits, the lease contract, game law, income tax, crop damage.
Not legal, tax or insurance advice. No warranty; see the page footer.

Tests: `node --test`. MIT licensed (`LICENSE`).
