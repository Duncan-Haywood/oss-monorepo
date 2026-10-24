# Pollination Contract Checker

A free browser tool (and small Node CLI) for beekeepers: **enter the fee per hive and what it
costs to deliver the bees, and see net per hive and the break-even fee.** Costs counted: trucking,
labour, feed, hive losses, hives that fail inspection (unpaid but still hauled), broker share, and
the income the hives would have earned at home. A second card gives growers the cost per acre and
the yield lift that pays for it. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/pollination-contract-checker/

After using this, you can now **tell whether a pollination contract clears your costs and what
fee you need to ask for**, which used to be a gut call or a spreadsheet rebuilt every season.

## Use

1. Open `index.html`, enter the contract and your costs (or load the example), click Check the contract.
2. CLI: `node cli.mjs --hives 400 --fee 175 --miles 1400 --fail 8 --broker 5 [--json]`
   (exit 1 when the contract loses money or leaves under 15% of the fee).

Not modelled: pesticide-exposure terms, post-contract honey flow, taxes, contract terms.
The tool holds no prices; the example numbers are made up. Not business, legal or tax advice.
No warranty; see the page footer.

Tests: `node --test`. MIT licensed (`LICENSE`); no secrets, no private dependencies.
