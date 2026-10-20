# Grease Trap Pumping Bid Calculator

A free browser tool for grease trap and interceptor pumping companies: **enter the trap, the truck and your costs, and get a price per visit, the pump-out interval that keeps the trap under the 25% grease-and-solids rule, and what each interval costs per year**. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/grease-trap-pumping-price-calculator/

After using this, you can now **bid a restaurant's grease trap from the dump trips it really costs, the disposal fee and the interval it needs**, which used to take a flat per-gallon rate and a guess about how often the customer should be pumped.

## Use

1. Open `index.html`, enter the trap (gallons, how full of grease and solids it was, weeks since the last pump-out), the truck (tank size, dump trip), the site (drive, setup, pump rate), crew, truck and disposal costs, margin and minimum charge, then click Price this trap.
2. Pure logic is in `calc.mjs` (`plan()`, `visitCost()`, `interval()`, `intervalTable()`, `encodeShare()`); tests: `node --test`.

Modelled: visit time from drive, setup, pump rate and a share of the dump trip (one load serves several small traps), crew and truck cost per hour, disposal per gallon, manifest cost, margin as a share of the price and a minimum charge; the interval from one inspection reading against a pump-out limit; annual price by interval; disposal-fee sensitivity; a share link. Not modelled: sales tax, permits and local pretreatment fees, emergency call-outs, jetting or camera work, penalties from the local authority, local rates.
Not legal, tax or financial advice, and not a statement of what your local authority requires: check your own FOG ordinance. No warranty; see the page footer. MIT licensed (`LICENSE`).
