# Estimated Tax Penalty Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/estimated-tax-penalty-calculator/>

A free browser calculator for the IRS **underpayment of estimated tax
penalty** (Form 2210, regular method). Entirely client-side; nothing is
uploaded.

After using this, you can now **see the dollar penalty for each missed
installment and how much paying now would stop** — which used to mean working
through Form 2210's Part III and IV by hand.

## Rules applied (IRC 6654 / Form 2210 instructions)

- Required annual payment: the smaller of 90% of this year's tax and 100% of
  last year's tax (110% if last year's AGI was over $150,000, $75,000 if
  married filing separately).
- No penalty if you owe under $1,000 after withholding, or last year's tax
  was $0 for a full year.
- Four equal installments (Apr 15, Jun 15, Sep 15, Jan 15). Payments apply to
  the oldest unpaid installment; withholding counts as paid evenly.
- Penalty = unpaid balance x annual rate x days / 365, from each due date
  until paid or the return due date. The rate is an input (the IRS republishes
  it quarterly).

## What this does not cover

The annualized income method (Schedule AI), farmers and fishers, waivers, a
rate that changes mid-period, and state penalties. Not tax advice.

## Run

Static ES modules, no build step: open `index.html`, or `node --test`.
MIT licensed; support is optional via GitHub Sponsors.
