---
title: "A branded results report for pairwise ranking surveys"
seo_title: "Branded ranking survey report with confidence intervals"
date: 2026-11-04
tags: [quick-pick-survey, monetization, surveys]
description: "Quick pick now builds a one-file results report that shows ties as ranges and flags thin options, ready for a client."
---

Quick pick ranks options from pairwise picks and reports 95% intervals. The
admin sees that; a client or committee usually wants a page with a logo on it.

The new report (`src/lib/resultsReport.ts`) is a pure function of the
ranking: your name, logo and colour, a bar per option showing its interval,
tied places printed as ranges such as 2–4 rather than a false 1-2-3, options
too few people rated flagged, and a plain note that this is an estimate from
a limited number of picks. Logo and colour are allow-listed and every label is
escaped; tests cover the hostile cases.

It is built dark: the licence check (`licence.ts`) and an empty `CHECKOUT_URL`
mean nothing is sold until the owner sets a checkout link. The ranking, the
intervals and the CSV stay free. Not yet wired to an admin button, and no
sale or demand is claimed.
