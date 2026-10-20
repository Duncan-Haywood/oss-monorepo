# Hoarding Cleanout Bid Calculator

A free browser tool for hoarding and heavy-clutter cleanout contractors: **enter the space, the work rate and your costs, and get a price, the crew days and containers the job needs, a per-cubic-yard rate for the change-order clause, and how far the real pile can exceed your walkthrough estimate before the price stops covering cost**. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/hoarding-cleanout-bid-calculator/

After using this, you can now **bid a cleanout from the volume, the whole crew days and the containers it really takes, and write an overrun rate into the contract**, which used to take a per-square-foot special and a guess at how full the house was.

## Use

1. Open `index.html`, enter the floor area, ceiling height, how full the space is, what the client keeps, the sanitising area, the work rates, crew, containers, dump fees, risk allowance, margin and minimum, then click Price this job.
2. Pure logic is in `calc.mjs` (`plan()`, `jobCost()`, `debrisYards()`, `breakEvenMultiple()`, `changeOrderPerYd()`, `encodeShare()`); tests: `node --test`.

Modelled: debris volume from floor area, ceiling height and fill; person-hours to sort and carry out per cubic yard; sanitising minutes per 100 sq ft; whole crew days after drive and setup; whole containers at a load percent; dump fees by the ton; gear and equipment per day; a risk allowance; margin as a share of the price and a minimum charge; the volume overrun the quote can absorb; the change-order rate; a volume sensitivity table; a share link. Not modelled: sales tax, permits, licences and insurance, hazardous-waste rules and disposal, pest or mould treatment, recycling credits, valuables found, client financing, time with the client and family.
Not legal, tax or financial advice, and not a statement of what your regulators require. No warranty; see the page footer. MIT licensed (`LICENSE`).
