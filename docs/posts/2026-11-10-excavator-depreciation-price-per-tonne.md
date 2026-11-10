---
title: "Excavators lose 6.5% of their value a year; mini excavators cost almost six times more per tonne"
seo_title: "Excavator depreciation and price per tonne from 363,718 auctions"
date: 2026-11-10
description: "On 363,718 US equipment auctions, track excavators depreciate 6.5% a year and skid steers 3.8%. Nearly new excavator price scales with weight to the 0.63."
tags: [heavy-market, heavy-equipment, research, construction]
---

How fast does a heavy machine lose value, and which size is the most expensive per tonne of steel? Those are the first market questions for the repository's open heavy-equipment track, because the answer says where an open, shop-built machine has the most room to undercut.

We fitted 363,718 US auction sales from the public Blue Book for Bulldozers data (1989 to 2012) with a model that compares each machine only to the same model sold in the same year, so inflation, the market cycle and model mix drop out. Annual depreciation, with 95% intervals:

- track excavators **6.5%** [6.2, 6.8]
- backhoe loaders 5.0%, dozers 4.6%, motor graders 4.5%, wheel loaders 4.2%
- skid steers **3.8%** [3.4, 4.3]

Every class loses value two to four times faster in its first ten years (6 to 9% a year) than after (2 to 4%). A naive regression without the model and year controls gets several classes wrong by more than a point, and ranks graders above excavators.

The second result is about size. Among track excavators 0 to 3 years old sold 2009 to 2012, price rises with operating weight only to the power 0.63 [0.60, 0.67]. So the median nearly new machine under 2 t sold for about $11,000 a tonne, 3 to 4 t for $5,400 and 40 to 50 t for $1,900. Per tonne, compact machines carry the most price above their steel and parts, which is where an open design should aim first.

Caveats: these are auction prices, not new list prices or dealer margins; the data ends in 2012; age is the only wear measure. The next steps add new prices, per-hour ownership costs and a priced open bill of materials. Code, tables and the figure: [research/heavy-market](https://marisstella.app/research/heavy-market/). Research only, not a valuation or advice.
