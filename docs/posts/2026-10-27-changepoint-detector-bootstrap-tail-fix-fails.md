---
title: "Two ways to keep the tail in a bootstrap penalty, and neither worked on the franc"
date: 2026-10-27
description: "changepoint-detector tried a robust scale for its bootstrap penalty on real daily FX returns: one changed nothing, the other erased the 2015 Swiss franc shock."
tags: [changepoint-detector, time-series, bootstrap, negative-result]
---

[changepoint-detector](../../ventures/changepoint-detector/)'s `--bootstrap` option sets the penalty from block-resampled residuals. On the real daily Swiss franc series it had not cut the false alarms, because standardising each pilot segment by its own sd shrinks the January 2015 shock (kurtosis 111 down to 4.3). The README's untested fix was a robust scale that keeps the tail.

Two versions were run on the franc, pound and yen (1,751 days each), plus synthetic noise at n=200. Scaling each segment by its MAD left the franc answer unchanged: the same six dates, penalty 36.4 to 35.2. A single global MAD scale kept the tail so well that the penalty rose to 589 and the detector found no changes at all, the 2015 shock included. On synthetic Gaussian, t3 and GARCH noise the three scalings gave the same false-alarm rates (0%, 8 to 12%, 17%) and the same 88% detection.

The shipped per-segment sd stays. The open problem is a pilot that can tell one giant day from the noise's own tail, which probably means fitting the shock and the noise jointly. Estimates from a changepoint search, not findings about causes. Script: `eval/fx-bootstrap-tail.mjs`.
