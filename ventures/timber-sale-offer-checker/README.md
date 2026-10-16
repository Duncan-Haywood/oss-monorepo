# Timber Sale Offer Checker

A free browser tool (and small Node CLI) for landowners: **list your logs, put your own
price per MBF on each species, enter a logger's offer, and see whether it looks low.**
Board feet are computed under Doyle, Scribner and International 1/4-inch rules, because the
same logs scale to very different volumes depending on the rule. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/timber-sale-offer-checker/

After using this, you can now **tell whether a timber offer is in the right range and what a
consulting forester has to add to pay for themselves**, which used to mean trusting the buyer's scale.

## Use

1. Open `index.html`. Paste logs (`species, small-end diameter in, length ft, count`) and your prices (`species, $/MBF`).
2. Enter the offer (lump sum or per MBF, and the rule it uses). Click Check the offer.
3. CLI: `node cli.mjs logs.csv --offer 12000 --price "red oak=420" [--per-mbf] [--rule doyle] [--fee 8] [--json]`
   (exit 1 when the offer is under 75% of the value at your prices).

## Rules

- Doyle = (D-4)^2 x L/16. International 1/4 = 4-ft sections, 1/2" taper each, 0.199D^2 - 0.642D. Scribner = common formula fit (approximate).
- Value = board feet / 1000 x your price. The tool holds no market data.
- Ratio = offer / International value at your prices; under 75% is flagged as a question to ask.
- Forester break-even uplift = fee / (1 - fee).

Not modelled: cull and defect deductions, roads and skidding, tops and pulpwood, taxes, contract terms.
Not forestry, legal or tax advice. No warranty; see the page footer.

Tests: `node --test`. MIT licensed (`LICENSE`); no secrets, no private dependencies.
