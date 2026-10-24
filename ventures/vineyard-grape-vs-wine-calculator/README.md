# Vineyard: Sell the Grapes or Bottle the Wine

A free browser tool (and small Node CLI) for vineyard owners and growers deciding between a grape contract and
their own label: **enter acres, yield, farming cost, the grape price you are offered, and what you expect to
get per bottle direct and through a distributor. You get net profit each way, your all-in cost per bottle, the
grape price that would match the wine, and the direct-sales share at which bottling starts to win.** A table
shows how wine profit moves with direct share and unsold bottles. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/vineyard-grape-vs-wine-calculator/

After using this, you can now **put a dollar figure on "should we make our own wine?"** before buying tanks,
barrels and a bottling run, which used to be an optimistic spreadsheet or a gut feeling.

## Use

1. Open `index.html`, enter the vineyard, the grape offer and your wine economics (or load the example), click Compare.
2. CLI: `node cli.mjs --acres 10 --tons 3.5 --grape-price 2400 --dtc-share 35 --dtc-price 32 [--json]`
   (exit 0 when wine wins, 1 when selling grapes wins, 2 on bad input).

Not modelled: start-up capital (tanks, press, barrels, building), vintage variation, cash-flow timing and
interest on aging inventory, bulk-wine sales, state-specific excise tiers (you enter the per-gallon figure),
taxes. The tool holds no price data; the example numbers are made up. Not legal, tax or financial advice.
No warranty; see the page footer.

Tests: `node --test`. MIT licensed (`LICENSE`); no secrets, no private dependencies.
