# Coffee Cart Event Quote Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/coffee-cart-event-quote-calculator/>

A free browser tool (and small Node CLI) for mobile coffee cart and espresso trailer owners: **enter your
cart's pace, prices and costs, the crowd you expect and what the host is offering, and see net profit and
break-even drinks for a booking fee, a share of sales and a prepaid drink guarantee.** Net per hour counts
setup and drive time. A table shows how each deal does if the crowd is half or 1.5 times what you expected.
Nothing is uploaded.

After using this, you can now **quote an event with a number instead of a guess, and pick the deal that pays**,
which used to be a gut call on the phone with the host.

## Use

1. Open `index.html`, enter the cart and the offers (or load the example), click Compare the deals.
2. CLI: `node cli.mjs --hours 5 --cups-hour 40 --price 5.75 --cups 140 --fee 350 --share 15 --guarantee 100 --guarantee-price 4.5 [--json]`
   (exit 1 when no deal covers cost).

Not modelled: tips, equipment depreciation, sales tax, multi-day events, weather, repeat bookings. The tool
holds no price data; the example numbers are made up. Not legal, tax or financial advice. No warranty; see
the page footer.

Tests: `node --test`. MIT licensed (`LICENSE`); no secrets, no private dependencies.
