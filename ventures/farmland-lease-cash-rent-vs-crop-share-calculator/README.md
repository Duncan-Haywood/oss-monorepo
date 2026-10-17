# Farmland Lease Calculator: Cash Rent vs Crop Share vs Flex

A free browser tool for landowners and farm operators negotiating a lease. Enter expected
yield, price, input costs and the terms of each lease. It shows, per acre and per field, what
the landlord and the operator each end up with under **cash rent**, a **crop share** and a
**flexible cash lease** (base rent plus a bonus on revenue above a threshold), the yield where
a crop share starts to beat the cash rent, the range of cash rents both sides could accept,
and a yield-by-price grid showing who carries the risk. Entirely client-side.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/farmland-lease-cash-rent-vs-crop-share-calculator/

After using this, you can **put numbers on a lease offer and see what each side gives up for
certainty**, which used to mean a spreadsheet built fresh every renewal.

## Try it

Open [`index.html`](index.html) and click **Compare the leases**.

## The model

[`calc.mjs`](calc.mjs), pure functions, no dependencies. Revenue is yield times price. Cash
rent pays the landlord a fixed amount per acre and leaves the operator everything else. A crop
share gives the landlord a share of revenue and has the landlord pay a stated share of seed,
fertilizer, chemicals and drying or hauling. A flex lease pays a base plus a percentage of
revenue above a threshold. In every lease the landlord's and operator's results add up to
revenue minus all costs; the tests check it.

## Limits

Defaults are placeholders, not any county's or year's figures. Government payments, crop
insurance indemnities, property tax, depreciation, landlord-owned improvements, tax
treatment, and state lease law are not modelled. It is not legal, tax or agricultural
advice; talk to your extension office, attorney or accountant.

## Tests

`node --test`
