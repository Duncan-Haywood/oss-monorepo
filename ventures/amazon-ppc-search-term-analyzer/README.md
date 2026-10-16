# Amazon PPC Search Term Analyzer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/amazon-ppc-search-term-analyzer/>

A free browser tool for Amazon sellers and PPC freelancers: **drop in a Sponsored
Products search term report and see which search terms spent money with no orders,
which are worth harvesting into an exact-match campaign at what bid, and how much
was spent above your target ACOS.** The file is read in the browser; nothing is
uploaded and no Seller Central or Ads API access is needed.

After using this, you can now **split no-order spend into proven, overspent and
too-little-data using your own click-to-order rate, list negative-keyword
candidates per campaign and ad group, pick harvest terms with a bid that cannot
exceed break-even, and see where your own campaigns compete for the same term**,
which used to mean giving a PPC tool (Helium 10 Adtomic, Perpetua, Teikametrics)
access to your ad account or building the pivot table by hand.

## Input

The Search term report (Campaign Manager, Measurement & reporting, Sponsored ads
reports, Search term, CSV). Needs `Customer Search Term`, `Spend`, `Clicks` and an
`Orders` column; `Campaign Name`, `Ad Group Name`, `Targeting`, `Match Type`,
`Impressions`, `Total Sales` and the report dates are used when present. The
7/14/30 day attribution prefix and unit suffixes are ignored, thousands separators
are handled, comma, tab and semicolon files in UTF-8 or UTF-16 are read, and
unreadable rows are listed with a line number and reason. Column names were
written from memory of the export; the first report of an unread file is the
priority fix.

## Model

Rows are combined per campaign, ad group and search term. A placement with no
orders is **proven** at the fewest clicks `n` with `(1 - rate)^n < 0.05` at the
account's click-to-order rate, **overspent** above one order's worth at the target
ACOS, otherwise **watch**. Placements with orders are profitable or unprofitable
against the target ACOS (the account average when none is given). Harvest terms
have enough orders, ACOS at or under target, are not ASINs, and have no exact
keyword in the file; the suggested bid is the lower of the average CPC and order
value x click-to-order rate x target ACOS. It is arithmetic on the file, not
advice; see the page for what is not modelled.

## Run

Open `index.html` in a browser (or serve the folder). Tests: `node --test`.
