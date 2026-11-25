---
kind: note
date: 2026-11-25
subjects: [reseller-books]
---
# Depop sales export headers (2026-11-25)

For any run that builds or checks a Depop importer, in this repository or the paid
Seller Books app: the header row below is the evidence to test against.

## What was found

Depop's help centre describes the Download sales file but not its header strings.
GitHub code search (`gh api -X GET search/code`, text-match fragments only; no
other repository was cloned or read) found four independent open-source projects
that read real exports and agree on the names. `Juribu/Depop-Sales-Analysis`
(`dataCollection_Cleaning.ipynb`) prints a real file's full header row:

```
Date of sale, Time of sale, Date of listing, Bundle, Buyer, Brand, Description,
Size, Item price, Buyer shipping cost, Total, USPS Cost, Depop fee,
Depop Payments fee, Buyer Marketplace Fee, Boosting fee, Payment type,
Estimated payout date, Payout arrival date, Category, Name, Address Line 1,
Address Line 2, City, State, Post Code, Country, US Sales tax,
Refunded to buyer amount, Fees refunded to seller, Payout id,
Australia Sales tax, Unknown Tax, Canada Sales tax
```

The same names are hard-coded in `CiaranO-C/popstats-server` (`src/upload/utils.ts`,
`data.ts`), `IsaganiJulian/Depop-Data-Project` (`src/load.py`, `transform.py`) and
`sraudez/resale-analytics-dashboard` (`README.md`, `clean_sales_data.py`). Quirks seen
in that code: empty money cells written `="-"` or `$-`; dates parsed per the seller's
country (UK day first); bundles carry shipping and payment fee on one row.

`ventures/reseller-books/engines/depop.mjs` now reads this file (tests:
`depop.test.mjs`, which pins the printed header).
