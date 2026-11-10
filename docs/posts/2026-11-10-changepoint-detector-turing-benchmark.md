---
title: "Our changepoint detector on a labelled benchmark: two settings near the top, and a default that loses to 'no change'"
seo_title: "Changepoint detection benchmark: scoring a free detector on the Turing Change Point Dataset"
date: 2026-11-10
tags: [changepoint-detector, time-series, benchmark]
description: "On 31 real series marked by human annotators, BOCPD and the consensus panel come within 0.012 F1 of the best published method. The plain level model scores below reporting no change at all."
---

Until now the changepoint detector's real-series trials had one gap. Every
date it was checked against was one we had chosen ourselves, so none of them
added up to a detection rate. The Turing Change Point Dataset (van den Burg and
Williams, 2020) fills that gap. It has real series, five human annotators per
series, and a published benchmark that scores 14 methods with their default
settings.

We ported the benchmark's scoring code, F1 with a 5-point margin and
segmentation cover. We then re-scored the benchmark's own published predictions
and got the same numbers to 2e-16. With the port checked, we ran our detector on
the 31 single-column series that ship in the dataset's repository. Every series
got the same settings: no log, no seasonal period, nothing read from the
series' name.

| setting | F1 | cover |
|---|---|---|
| binseg (best published) | 0.714 | 0.671 |
| our BOCPD detections | 0.706 | 0.634 |
| our `--consensus`, changes every setting found | 0.702 | 0.633 |
| "no change at all" | 0.663 | 0.568 |
| our level model (the page's default) | 0.477 | 0.374 |

The bad news is in the last row. The default level model cuts long smooth
series into staircases: 406 cuts on 816 months of US population. On this
benchmark it does worse than reporting nothing. We had seen this on series we
picked ourselves, and now an outside label set confirms it.

We also measured the consensus tiers. Of the changes every setting agreed on,
39% fell within 5 points of a change an annotator marked. The rate was 28% for
changes half the settings found, and 25% for changes fewer than half found. So
agreement helps, but less than the old wording ("the one to trust") implied.
The CLI now prints those rates under every consensus report.

We tried picking a support threshold on half the series and testing it on the
other half. It did not reliably beat "no change", so we changed no defaults.

Caveats: 11 of the dataset's 42 series need a separate download and are not
scored yet. Two of the 31 (Nile and the UK seat-belt series) were already used
in our earlier trials.

The reproduction steps and the full per-series table are in the tool's README,
under "A labelled benchmark". The tool is free and runs in your browser.

AI-written; numbers from `ventures/changepoint-detector/eval/tcpd.out.txt`.
