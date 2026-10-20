# Percentage Rent Audit Checker

A free browser tool that recomputes a landlord's percentage-rent statement for a retail or restaurant tenant from the lease terms and the
tenant's own sales, prices each line worth questioning, names the record that would prove it, and drafts an editable review note. Entirely
client-side; nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/percentage-rent-audit-checker/

After using this, you can now **see whether the percentage rent billed follows from your lease and your sales, and which lines to question**,
which used to mean trusting the statement or paying an accountant to redo it.

## What it calculates

Percentage rent = rate x (gross sales - breakpoint), never below zero, optionally capped.

- **Breakpoint**: natural (base rent / rate) or a stated artificial one.
- **Arithmetic**: the billed amount against the landlord's own sales figure and the lease terms.
- **Sales gap**: the landlord's gross sales against the tenant's POS or books for the same dates.
- **Exclusions**: refunds, gift-card sales, tax and similar lines the lease excludes, each priced alone; the combined result is recomputed and the lines are shown to add up to the overcharge.
- **Cap** and **estimates paid** give the balance by the statement and by the tenant's numbers; a statement date and objection window give a deadline.

No lease language ships; the user supplies the terms. Bad input throws instead of clamping.

## Run it

Open [`index.html`](index.html). Tests: `node --test 'ventures/percentage-rent-audit-checker/**/*.test.mjs'`.

Not legal, tax, or financial advice. See the page for the full disclaimer.
