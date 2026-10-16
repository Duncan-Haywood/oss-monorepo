# Sawmill Custom Sawing Calculator

A free browser tool (and small Node CLI) for portable-sawmill operators who saw other people's logs for money:
**enter your mill, blades, fuel, crew and the logs on a job, and see what a sawing hour really costs, the
break-even and target quote per board foot and per hour, which pricing model pays more on this job, and
which log diameters lose money at your flat per-board-foot rate.** The page also shows how far the Doyle log
scale undercounts the board feet you actually sawed. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/sawmill-custom-sawing-calculator/

After using this, you can now **quote a custom sawing job at a rate that covers your blades, fuel, helper and
your own time**, which used to be a number copied from the next sawyer over.

## Use

1. Open `index.html`, change the numbers (or load the example), click Work out the quote.
2. CLI: `node cli.mjs --logs 24 --dia 14 --len 10 --rate 0.55 --hourly 85 [--json]`
   (exit 1 when the better pricing model still loses money on the job).

Modelled: ownership (depreciation and interest), fuel, blade and sharpening cost, maintenance, helper and owner
labor, per-log handling time, setup and tear-down, and the trip. Sawn board feet are estimated from the log's
true volume (small-end diameter, taper, a recovery percentage); Doyle is shown for comparison.
Not modelled: log species or grade, lumber resale value, drying, taxes, insurance, liability, seasonal demand.
The tool ships no price data; the example numbers are made up. Not legal, tax or financial advice. No warranty;
see the page footer.

Tests: `node --test`. MIT licensed (`LICENSE`); no secrets, no private dependencies.
