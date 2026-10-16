# FBA Aged Inventory & Storage Fee Analyzer

A free browser tool for Amazon FBA sellers: **load your Inventory Age report and see, per SKU,
the storage fees and aged-inventory surcharge you will pay, and whether holding, marking down
or removing the stock earns more.** The file is read in the browser; nothing is uploaded and no
Seller Central access is needed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/fba-aged-inventory-fee-analyzer/

After using this, you can now **see, per SKU, what holding costs over the next months and which of
hold / mark down / remove the aged units / remove everything has the best projected profit**, which
used to mean a spreadsheet per SKU or a paid inventory-management subscription.

## Input

- **Inventory Age** (Seller Central → Inventory → Inventory Planning, or Reports → Fulfillment):
  `sku` and the `inv-age-…` bucket columns; `units-shipped-t30/t90`, `your-price`, `item-volume`
  and `volume-unit-measurement` used when present. An optional `unit cost` column gives per-SKU costs.

**Column names are matched by alias and no real Seller Central export was available**; a file
that is not read lists the rows skipped and why.

## Model

Units are dated at their age bucket's midpoint and sold oldest first at the recent shipping pace.
Each 30-day step charges storage (per cubic foot, with an Oct–Dec rate) and the aged surcharge for
the age each lot has reached, on the average units held. Options are simulated to sell-through
(capped at 36 months); a price cut lowers margin and raises sales by an editable elasticity.
**The fee tables are typed defaults from memory of public pages and are unverified**; Amazon
changes them, so the page tells the user to replace them. Not modelled: the per-unit minimum on the
oldest tier, other FBA fees, restocking, seasonality, returns, tax.

## Run

Open `index.html` through any static server. Tests: `node --test`.
