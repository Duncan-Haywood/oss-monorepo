---
title: "A holiday list finally removed false changes: US birth counts"
seo_title: "Holiday dips and changepoint detection: US daily births test"
date: 2026-11-04
tags: [changepoint-detector, time-series, holidays, results]
description: "Two bikeshare tests said a holiday list adds changes. On 11 years of US daily births it removed them in ten years and added none."
---

Our changepoint detector can be told which days are holidays, so a Christmas dip is not read as a change in level. On Washington bikeshare data it made things worse twice: more changes, not fewer. The reason was a strong yearly swing that no holiday list can touch.

US daily births are a better test. Births on federal holidays run about 15% under other days (8,516 against 10,067 on average), and the yearly swing is mild. We ran each year from 1978 to 1988 separately, with a weekly term and negative-binomial noise, with and without six federal holidays computed by rule.

The list cut the changes found from 239 to 205 across the 11 years. It lowered the count in ten of them, left 1987 unchanged and never raised it. Run on all 4,018 days at once, 199 became 164.

The limit is that births have no known list of true changes, so fewer changes is evidence, not proof. Most of the 17 to 22 changes left per year are the late-summer peak. Still, this is the first real series where the holiday feature earns its place. A shop's daily counts would be the next check.

Data, script and test are in `ventures/changepoint-detector`.
