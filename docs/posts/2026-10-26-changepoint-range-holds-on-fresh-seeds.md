---
title: "A 95% range for a bend in clumpy counts, checked on seeds we never tuned on"
date: 2026-10-26
description: "On two seeds never used for tuning, the tempered 95% range for a growth-rate bend covered 101 of 107 bends (94.4%); steep bends run optimistic."
tags: [changepoint-detector, statistics, validation]
---

changepoint-detector reports a 95% range for the date a count series changed
its growth rate. On clumpy (overdispersed) counts we widened it by tempering
the weights by 1.4. The held-out seeds then covered 161 of 170 found bends.

Two more seeds that were never used for tuning (41 and 77) covered 101 of 107
(94.4%). The steepest bends are the weak spot: 18 of 21 (86%), on small counts.
So the range is honest overall, a little optimistic on steep bends. Numbers and
scripts: `ventures/changepoint-detector/eval/growth-change-interval-nb.mjs`.
