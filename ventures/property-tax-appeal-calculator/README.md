# Property Tax Appeal Calculator

A free browser tool for homeowners and small landlords: **enter your assessed value and a few
recent comparable sales, and see whether your property tax assessment looks too high and
whether an appeal would pay.** Nothing typed is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/property-tax-appeal-calculator/

After using this, you can now **see the market value your assessment implies against the
adjusted comparable sales, an equity check on assessment per square foot, the tax saved per
year, the win probability an appeal needs to break even, and what a contingency appeal firm
would keep**, which used to mean building a comp grid in a spreadsheet or paying a firm a share
of the saving.

Related: [`seller-net-sheet`](../seller-net-sheet/),
[`estate-sale-net-proceeds-calculator`](../estate-sale-net-proceeds-calculator/),
[`salt-cap-calculator`](../salt-cap-calculator/).

## Input

- Assessed value, assessment ratio, total tax rate, and the subject's size, beds, baths, lot and
  year built.
- One comparable sale per line: label, price, sq ft, beds, baths, lot, year, months since sale,
  assessed value. Only the price is required.
- Optional adjustment rates ($ per sq ft, bed, bath, 1,000 sq ft of lot, year of age; monthly
  market drift), filing costs, years the reduction holds, contingency share.

## Model

Adjusted comp = price + time drift + size, room, lot and age differences at the given rates.
Comps over 25% gross or 15% net adjustment are flagged weak. The indicated value weights each
comp by how little it needed adjusting; a lower-quartile scenario stress-tests it. The equity
value is the median assessed $/sq ft of the comps times the subject's square feet. Tax saved is
the assessment reduction times the tax rate. Not modelled: condition, view, upgrades, caps,
exemptions, deadlines, and the chance a board agrees. Default rates are rules of thumb, not
local market data. Not an appraisal, not tax or legal advice.

## Run

Open `index.html` through any static server. Tests: `node --test`.
