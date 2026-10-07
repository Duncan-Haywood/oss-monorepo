# Etsy Ads ROI Analyzer

A free browser tool for Etsy sellers: **drop in the Etsy Ads listing table and
see which advertised listings lose money after Etsy's fees and the ad spend.**
The file is read in the browser; nothing is uploaded.

After using this, you can now **see per listing the ROAS, the profit left after
ad spend and Etsy fees, the break-even ROAS your margin demands, the cost per
order, and a ranked pause / lower / keep list**, which Etsy's dashboard does not
show because it does not know what your items cost.

## Input

A listing-level CSV with a listing title or ID, a Revenue column and a Spend
column; views, clicks and orders are used when present (header aliases such as
Ad spend, Ad revenue, Purchases, Impressions are matched). A preamble line and a
totals row are tolerated; rows for one listing are summed. Unreadable rows are
listed with a line number and reason.

Inputs only you know: item margin before Etsy fees and ads, and the share of
credited orders that would have happened anyway. Etsy fee rates (transaction
~6.5%, processing ~3% + $0.25/order) are editable approximations.

## Model

- Etsy fees = revenue x (transaction % + processing %) + orders x per-order fee
- profit before ads = revenue x margin - fees; profit after ads = that - spend
- break-even ROAS = revenue / profit before ads
- pause: no orders or a loss even if the ad caused every order; lower: a loss at
  your sold-anyway share; keep otherwise

Not modelled: Offsite Ads fees, listing fees, later refunds, VAT/sales tax,
regional fee differences. One margin is applied to every listing.

## Run

```
node --test
```

Open `index.html` in a browser. No build, no dependencies. Not affiliated with
Etsy, Inc.
