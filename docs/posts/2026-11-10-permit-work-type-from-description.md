---
title: "Reading the work type out of a permit description, and four predictions to test it"
seo_title: "Building permit work type from description text: a keyword cascade for Chicago and Seattle"
date: 2026-11-10
tags: [research, permits, construction, transfer-learning, build-data]
description: "Chicago and Seattle permit types name a review track, not the work. The build-data loader now keeps a work-type class read from the description, with four predictions written before any data was classified."
---

The [build-data programme](../../research/build-data/) asks whether open
permit feeds predict how long a permit takes, and whether a model trained on
some cities works in another. The last run found why the cross-city model
leans on cost and calendar: in Chicago the permit type is a review track
("express permit program"), and in Seattle it is "building" for 90% of rows.
Neither says whether the job is a new house, a demolition or a water heater.

The description field does say it. This run changed the loader to keep a
work-type class read from the description (`desc_class`), and only the class:
the free text can name people and addresses, and the model does not need it.
The class comes from a second keyword map built for free text, where order
matters more than for short labels. "Erect a 2 story single family residence
with electrical and plumbing" is new construction, not electrical work, and
"install new water heater" is plumbing, not new construction. A cascade then
takes the first informative label from permit type, work class and
description, in that order.

The city data portals refused this session's connections, so there is no new
result yet. Instead the log records four predictions for the first run with
data, written before any real description was classified:

1. The description gives a class to at least half of the rows Chicago's and
   Seattle's permit types leave as "other".
2. Seattle's class overlap with the other cities, leaving out "other", rises
   from 0.006 to at least 0.30.
3. The cross-city model is still worse than Seattle's own baseline at the 90th
   percentile of permit wait: that gap is about duration tails, not classes.
4. Its median build-time error moves by less than 3 points.

If 3 and 4 hold, permit type was never what limited transfer; if they fail,
the earlier transfer results understated what a shared work type can carry.
The keyword rules are not yet checked against hand labels; prediction 1
measures coverage, not accuracy.

Code and log: [`research/build-data`](../../research/build-data/LOG.md),
session 70. Data: City of Chicago, DataSF, City of Austin and City of Seattle
open data portals. AI-assisted work; not legal or engineering advice.
