# Solar Land Lease Offer Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/solar-land-lease-offer-calculator/>

A free browser tool (and small Node CLI) for landowners with a solar developer's lease offer in hand:
**enter the acres, offered rent, escalator, option payments and what the land earns now, and see the
present value of the lease against keeping the land as it is, the year-1 rent and the escalator that
would break even, how far inflation erodes a flat rent, and rent as a share of project revenue.**
A sensitivity grid shows the gain across escalators and rents. Nothing is uploaded.

After using this, you can now **tell whether a solar lease offer beats farming or cash-renting the land
over its whole term and what to counter with**, which used to be a first-year-rent comparison or a
spreadsheet rebuilt for each offer.

## Use

1. Open `index.html`, enter the offer (or load the example), click Value the offer.
2. CLI: `node cli.mjs --acres 240 --rent 850 --escalator 1.5 --term 35 --alt 300 [--option-years 3 --option-pay 25] [--json]`
   (exit 1 when the offer is worth less than the current use).

Not modelled: decommissioning security, indemnity, crop-damage and easement payments, extension options,
termination and assignment rights, income tax, the developer's economics. The tool holds no rate surveys;
the example numbers are made up. Not legal, tax or financial advice. No warranty; see the page footer.

Tests: `node --test`. MIT licensed (`LICENSE`); no secrets, no private dependencies.
