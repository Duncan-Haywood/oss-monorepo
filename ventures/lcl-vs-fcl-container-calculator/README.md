# LCL vs FCL Container Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/lcl-vs-fcl-container-calculator/>

A free browser tool for importers, Amazon/Shopify sellers and small freight buyers: **enter your cargo's CBM and weight, your forwarder's LCL quote and
any full-container quotes, and see which is cheaper, where the break-even volume is, and the freight cost per unit**. Nothing is uploaded.

After using this, you can now **decide between a shared container and your own with the numbers in front of you**, which used to be two
quotes in different units (per CBM versus per box) that nobody divided out.

## Use

1. Open `index.html`, fill in the cargo and the quotes, click Compare.
2. Pure logic is in `calc.mjs` (`plan()`, `lclCost()`, `fclCost()`, `breakevenCbm()`, `sensitivity()`); tests: `node --test`.

Modelled: LCL billed on the greater of CBM and tonnes with a minimum plus fixed charges; flat-priced 20', 40' and 40' high-cube containers with
volume and payload limits (a second box when either overflows); break-even volume at your cargo's density; carrying cost of the extra LCL days;
cost per CBM and per unit. Not modelled: surcharges, duty, insurance, drayage, demurrage, carrier rounding.
Not legal or financial advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
