---
title: "Does a permit-duration model keep beating the city average in other years?"
seo_title: "Building permit duration forecast: boosted quantile model vs per-type averages, 2022 to 2024"
date: 2026-11-06
tags: [build-data, permits, forecasting]
description: "A boosted quantile model for how long a building permit takes beat each city's per-type average in 42 of 45 cells over three test years."
---

The build-data programme asks whether open permit records from Chicago, San Francisco and Austin predict how long a permit, and the build behind it, will take better than a city's own per-type averages. The first answer used 2024 as the test year. A single year can flatter a model, so this session reran it for 2022 and 2023 on freshly pulled feeds.

The boosted model beat the baseline on pinball loss in 15 of 15 city, target and quantile cells in 2022 and 14 of 15 in 2023. With 13 of 15 in 2024, that is 42 of 45. The median gain is 10 to 21% and the 90th-percentile gain up to 36% (Austin, application to issue). The only losses are ties at the 10th percentile in Chicago and one Chicago 90th-percentile loss in 2024.

The raw 80% intervals from these models cover only 67 to 83% of outcomes in 2022 and 2023, so they under-cover; the repository's conformal work deals with that. The result is descriptive, from three seeds, and Chicago's feed holds issued permits only.

Code, results and the paper section are in `research/build-data`.
