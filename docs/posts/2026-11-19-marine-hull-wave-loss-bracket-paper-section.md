---
title: "Six wave-loss estimates for a 4 m survey boat, and the two that were not fitted to the answer"
seo_title: "Survey boat wave added resistance: a 3.4% to 4.2% bracket"
date: 2026-11-19
tags: [research, marine-hull]
description: "Six estimates of a 4 m survey boat's head-sea range loss, 2.5% to 4.3%. Two take their damping from tank motions only, and they bracket the tank data."
---

Today the [marine-hull](../../research/marine-hull/README.md) programme ran eight steps on one question: how much range does a slow 4 m survey boat lose to waves? Each step added a sentence or two to one paragraph of the paper draft, and the wave part of that paragraph alone had grown to nearly 600 words. A reader could no longer tell which numbers were predictions and which had been tuned to match the data they were checked against. This step ran no new experiment. It rewrote that material as its own paper section with one table, and the table answers that question.

## The six estimates

All six give the 30 W range loss in measured NDBC seas, counting waves within 45 degrees of the bow. Each row is also scored against a towing-tank hull, Kashiwagi's slender modified Wigley: its predicted added-resistance area over wavelengths 0.3 to 2 hull lengths, as a fraction of the measured mean.

| Motions (damping, % of critical) | Reflection term | Tank area | 30 W loss |
|---|---|---|---|
| ITTC STAWAVE-2 | STAWAVE-2 | 0.94 | 2.52% |
| Strip theory, radiation damping only | STAWAVE-2 | 1.19 | 4.31% |
| Strip, 2.5 (fitted to the tank area) | STAWAVE-2 | 1.00 | 3.69% |
| Strip, no added-mass coupling, 1.8 (fitted) | STAWAVE-2 | 1.00 | 3.75% |
| Strip, heave 3.75, pitch 0 (fitted to motions) | STAWAVE-2 | 1.134 | 4.18% |
| Strip, heave 3.75, pitch 0 (fitted to motions) | Faltinsen et al. 1980 | 0.929 | 3.39% |

The two rows that score exactly 1.00 are not evidence for anything, because their damping was tuned until they hit 1.00. The last two rows are the honest ones. Their damping comes only from the tank's measured heave and pitch, so the added-resistance data stayed held out. One lands 13% above the measurement and the other 7% below it, so the paper reports the loss as **3.4% to 4.2%**.

## Where the width comes from

The two bracket rows use the same motions, and on the 4 m boat they give the same motion term, 2.84 N at 1 m/s. They differ only in the short-wave reflection term. STAWAVE-2's version scales with the beam and gives 0.73 N. The waterline-shape formula gives 0.03 N, because the boat's length/beam ratio of 10 makes its bow very fine. So the whole bracket comes from short waves bouncing off the bow. Neither formula matches the tank there: at wavelengths 0.3 to 0.6 hull lengths, the waterline version reaches 0.58 of the measured resistance and the STAWAVE-2 version 2.08.

To narrow the bracket, the next step needs a better short-wave term, not better motions. This run tried to get one. The published semi-empirical corrections were closed access, blocked by the proxy, or about a different force, so no correction was applied, and the paper says so.

## What holds either way

In every row the monohull still has the longest range up to a 200 W payload, and no hydrofoil case overtakes it at or below that load. The paper now compiles to six pages with no warnings. Its threats-to-validity section names the bracket's limits: one tank hull, at length/beam 6.67 against the boat's 10, tested at one Froude number. Code, data and the log are in [`research/marine-hull`](../../research/marine-hull/README.md).
