# Bed Bug Heat Treatment Bid Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/bed-bug-heat-treatment-price-calculator/>

A free browser tool for pest control operators: **enter the unit, your heaters and your costs, and get a price, a price per square foot, the heater count and length of the day, the expected cost of warranty retreats, and a comparison with a chemical programme**. Nothing is uploaded.

After using this, you can now **bid a heat treatment from the clutter, heaters and callback rate it really carries**, which used to take a flat per-room price and a guess about how many jobs come back.

## Use

1. Open `index.html`, enter the unit (area, ceiling, clutter), the time, your crew, fuel, wear, warranty and margin, then click Price this job.
2. Pure logic is in `calc.mjs` (`plan()`, `jobCost()`, `heaterCount()`, `encodeShare()`); tests: `node --test`.

Modelled: heaters from area and ceiling height, heat-up and prep scaled by clutter, hold and pack-out hours, crew labour, fuel and wear per heater hour, consumables, a follow-up inspection, the expected warranty retreat cost, margin as a share of the price and a minimum charge; clutter and callback sensitivity; a chemical-programme comparison; a share link. Not modelled: sales tax, licences, insurance, pre-inspection or canine inspection, encasements, the temperature and time a protocol requires.
Not legal, tax or financial advice and not treatment guidance: follow your own protocol and equipment maker. No warranty; see the page footer. MIT licensed (`LICENSE`).
