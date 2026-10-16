# eBay Promoted Listings ROI Analyzer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/ebay-promoted-listings-roi-analyzer/>

A free browser tool for eBay sellers: **drop in the Promoted Listings report
from Seller Hub and see which listings lose money after the ad fee.** The file
is read in the browser; nothing is uploaded.

After using this, you can now **see per listing what profit is left after ad
fees, and what share of the sales eBay credits to the ad the ad must really have
caused for the fee to pay for itself**, which eBay's report does not show
because it does not know what your items cost.

## Input

A listing-level CSV with a listing ID or title, a Sales column and an Ad fees
column. Impressions, clicks, quantity sold, campaign and ad rate are used when
present; preamble lines above the header and a totals row are tolerated. Rows
for one listing are summed. Unreadable rows are listed with a line number and
reason, never dropped silently.

Two inputs only you know: profit margin before ad fees (% of sale price) and
the share of credited sales you think would have sold anyway.

## Model

- profit before ads = sales x margin; profit after fees = that minus ad fees
- must-be-caused share = ad fees / profit before ads; above 100% the listing
  loses even if the ad caused every sale
- verdicts: loses (>100%), marginal (>60%), fails your assumption, pays

Not modelled: later returns, cancelled-order fees, ranking side effects. One
margin is applied to every listing.

## Run

```
node --test
```

Open `index.html` in a browser. No build, no dependencies. Not affiliated with
eBay Inc.
