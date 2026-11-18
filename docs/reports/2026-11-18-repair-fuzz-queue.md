---
kind: note
date: 2026-11-18
subjects: [fuzz, edi-x12-order-checker, xero-bank-statement-csv-check, vcard-contacts-check, ofx-file-check]
---
# Repair fuzz: open failures (2026-11-18)

For the next run on the file-check ventures. `platform/fuzz/repair.mjs` mutates each venture's `sample*()` files
and checks that `validate`/`repair` never throw and that `repair(repair(x)) == repair(x)`. Every one of the 50
qualifying ventures has a `repair-fuzz.test.mjs` running 400 mutants at the default seed (20261118); all pass.
The post: `docs/posts/2026-11-18-fuzzing-fifty-repair-buttons.md`.

## Fixed in this run (each with a regression test in the venture's `calc.test.mjs`)

edi-x12-order-checker (letter picked as delimiter, repair corrupted ISA), xero-bank-statement-csv-check (Debit
written unsigned when both Debit and Credit set; blank row after dropped columns), redirect-map-check (loop through
a slash-less target flattened into a self-redirect), bai2-to-ofx-converter and bai2-statement-reader (convention
vote tie), mt940-statement-check (blank line added per repair), vcard-contacts-check (dedupe before FN fill),
gpx-track-check (segment emptied by 0,0 removal survived), hubspot-contacts-csv-check (row blank after fixes),
quickbooks-iif-file-check, google-contacts-csv-check, xero-contacts-csv-check, xero-invoice-csv-check and
gtin-list-check (crashes).

## Still open: found with longer runs at other seeds

Reproduce and print the smallest failing input with:

```
node platform/fuzz/repair.mjs --n 3000 --seed <seed> <slug>
```

| slug | seed | property |
|---|---|---|
| squarespace-product-csv-check | 1 | repair not idempotent |
| vcard-contacts-check | 1, 2, 3 | repair not idempotent (a different case from the one fixed) |
| google-contacts-csv-check | 2 | repair not idempotent |
| pipedrive-import-csv-check | 2 | repair not idempotent |
| ofx-file-check | 3 | repair not idempotent |
| quickbooks-chart-of-accounts-csv-check | 3 | repair not idempotent |

How the fixes in this run went: shrink the input line by line, then character by character, while the property
still fails (`min2.mjs` in the session scratchpad did this; the same loop is easy to rewrite on top of
`checkRepair` and `repairedText`). Then read the repair's two change lists side by side. The usual causes were a fix
whose result another fix should then have seen (do the dependent fix in the same pass, or loop to a fixed point),
trailing-blank handling, and tie-breaks that depend on input order. Not every non-idempotent repair is wrong
(one could argue a repair should do one safe step), but each one found so far was a real defect from a user's
point of view: the downloaded "fixed" file still drew changes from the same tool.

When an open case is fixed, raise that venture's test to the seed that found it, or add the minimal input as a
named test, and remove its row here.
