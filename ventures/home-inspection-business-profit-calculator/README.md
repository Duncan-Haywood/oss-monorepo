# Home Inspection Business Profit Calculator

A free browser tool for independent home inspectors: **enter inspections per week by type, fees by home size, on-site, report and drive hours, mileage, fall-through, insurance, software and equipment, and get profit per inspection and per hour all-in, the fee each type needs for your target margin, break-even inspections per month, what each add-on earns per hour, and solo versus hiring an associate inspector paid per inspection**. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/home-inspection-business-profit-calculator/

After using this, you can now **see what an inspection earns per hour once the drive, the report and the deals that fall through are counted, which add-ons are worth pushing, and whether an associate adds profit**, which used to take a spreadsheet and a guess.

## Use

1. Open `index.html`, enter a typical week, the costs and the associate terms, then click Work out the business.
2. Pure logic is in `calc.mjs` (`plan()`, `standardFee()`, `lineResult()`, `breakEven()`, `associate()`, `fixedCosts()`, `encodeShare()`); tests: `node --test`.

Modelled: a standard inspection fee as base plus a per-square-foot rate above a threshold, sewer scope, radon and WDO or mold add-ons that ride on a standard inspection's trip, re-inspections as their own trip, on-site, report and drive hours, mileage, a fall-through rate with the share of lost hours that cannot be refilled, E&O, software, other dues and equipment spread to a weekly fixed cost, agent-marketing or referral cost as a percent of fees, the owner's hourly value, profit per inspection and per hour, the fee for a target margin per type, break-even trips per month with and without the owner's pay, add-on value per hour, and an associate paid per completed inspection with owner report review, extra volume, break-even volume and the most pay that holds the target margin, a share link, CSV. Not modelled: income and sales tax, card fees, vehicle purchase and depreciation beyond the per-mile figure, associate licensing and worker classification, liability claims, seasonality, hiring time, pay beyond the hourly figure.
Not legal, tax or financial advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
