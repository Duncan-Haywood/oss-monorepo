# Fixed-Bid Overrun Forecaster

A free browser tool (and small Node CLI) for anyone billing a fixed fee: **enter the price,
your cost budget, how much is physically done and what you have spent, and see whether the
job finishes inside the price.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/fixed-bid-overrun-forecaster/

After using this, you can now **spot a fixed-price job that will lose money while you can
still change scope, price or staffing**, which used to mean building an earned-value sheet
per project.

## Use

1. Open `index.html`; enter price, cost budget, percent complete, cost to date (and planned
   percent, optional). Optionally paste a status history to see the CPI trend.
2. CLI: `node cli.mjs --price 80000 --budget 62000 --complete 45 --spent 55500 [--planned 50] [--json]`
   (exit 1 when the likely forecast is a loss).

## Rules

- Earned value = budget x percent complete. CPI = EV / actual cost. SPI = EV / planned value.
- Final cost three ways: one-off overrun (AC + BAC - EV), CPI continues (BAC / CPI), cost and schedule
  slip (AC + (BAC - EV) / (CPI x SPI)).
- Margin = price - final cost. Extra revenue to hold the plan = forecast final cost - budget.

Not modelled: change-order rights, retainage, payment timing, taxes, overhead, or whether the percent
complete is right. No warranty; see the page footer.

Tests: `node --test`. MIT licensed (`LICENSE`); no secrets, no private dependencies.
