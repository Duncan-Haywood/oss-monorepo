# SaaS Efficiency Metrics Calculator

A free browser calculator for SaaS founders and finance leads: **burn multiple, magic
number, Rule of 40 and runway from one quarter of numbers.** Entirely client-side;
nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/saas-efficiency-metrics-calculator/

After using this, you can now **see the three efficiency numbers investors ask about
side by side, with benchmark bands and the burn cut or ARR growth needed to reach a 1.5
burn multiple**, which used to mean rebuilding the formulas in a spreadsheet each quarter.

## Inputs

This and last quarter's revenue, net burn, and optionally net new ARR, last quarter's
sales and marketing spend, revenue a year ago, and cash on hand.

## Formulas

- Net new ARR = entered value, else (revenue - prior revenue) x 4
- Burn multiple = net burn / net new ARR
- Magic number = (revenue - prior revenue) x 4 / prior-quarter S&M
- Rule of 40 = YoY growth + free cash flow margin (-net burn / revenue), in points
- Runway = cash / (net burn / 3)

## What this does not cover

Seasonality, annual-prepay cash timing, one-off financing or capex inside net burn, FX
and cohort quality. Bands are widely quoted rules of thumb, not standards.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind,
express or implied. It is not legal, tax, or financial advice, and it does not replace
a qualified professional. **You are responsible for reviewing and verifying its output
before relying on it.** To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

## Privacy

Everything runs in your browser. Inputs are never uploaded. Anonymous feature counts
live only in local storage and can be turned off on the page.

## Run

Static ES modules, no build step: open `index.html`, or `node --test`.
MIT licensed; support is optional via GitHub Sponsors.
