# FBA Reimbursement Claim Finder

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/fba-reimbursement-claim-finder/>

A free browser tool for Amazon FBA sellers: **load your Inventory Ledger and Reimbursements
report and see which lost and damaged units look unreimbursed.** Files are read in the browser;
nothing is uploaded and no Seller Central access is needed.

After using this, you can now **see, per SKU, the lost and damaged units that were neither
found nor reimbursed, what they are worth, the date each claim window closes, and a draft
Seller Support case text**, which used to mean a spreadsheet join of two reports or a recovery
service keeping a percentage of what it wins.

## Input

- **Inventory Ledger**, summary view (Seller Central → Reports → Fulfillment): `Date`, `MSKU`
  (or `SKU`) and `Lost` and/or `Damaged`; `Found`, `Title`, `FNSKU`, `Unknown Events` used when present.
- **Reimbursements** (optional): `sku`, `reason`, `quantity-reimbursed-total`, `amount-total`,
  `approval-date`.

**Column names are matched by alias and no real Seller Central export was available**; a file
that is not read lists the rows skipped and why.

## Model

Missing = Lost + Damaged. Found units and lost/damaged reimbursements are taken off, oldest
loss first; reversals add back; other reasons are ignored. Value = average reimbursement per
unit for that SKU, else a default you type. Aged against a claim window (18 months) and a wait
(45 days), both editable because Amazon changes them. Inbound shortages, fee-error disputes and
Amazon's decisions are not modelled; Amazon decides every claim.

## Run

Open `index.html` through any static server. Tests: `node --test`.
