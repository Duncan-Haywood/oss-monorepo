# Water Damage Drying Estimate Calculator

A free browser tool for water damage restoration contractors: **enter the wet floor, wall and ceiling area, the water class and your rates, and get the air movers and dehumidifiers the loss needs, the equipment-day bill, the job margin, and what an extra drying day or a short carrier approval does to it**. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/water-damage-drying-estimate-calculator/

After using this, you can now **size the equipment and see the margin before the carrier approves fewer days than you plan to dry**, which used to take a rule of thumb at the loss and a surprise when the invoice was cut.

## Use

1. Open `index.html`, enter the wet areas, water class, your equipment ratios and rates, planned and approved drying days, then click Estimate this loss.
2. Pure logic is in `calc.mjs` (`plan()`, `equipment()`, `jobCost()`, `encodeShare()`); tests: `node --test`.

Modelled: air movers from floor, wall and ceiling ratios; dehumidifiers from cubic feet over a class factor; equipment billed per approved day and costed per day on site; technician set, pickup, monitoring and drive time; extraction and demo labour; consumables; margin against a target; margin by drying days; a share link. Not modelled: category 2 and 3 protocols, containment, air scrubbers, contents, mould or asbestos testing, subcontractors, permits, overhead and profit markups, regional price lists, carrier-specific rules.
Not legal, tax or financial advice, and not a drying plan: follow your own standard and carrier guidelines. No warranty; see the page footer. MIT licensed (`LICENSE`).
