---
title: "The year that broke a solar boat's seasonal correction was not a bad estimate, just a cautious one"
seo_title: "Solar USV seasonal correction: why one learning year fails"
date: 2026-11-15
tags: [research, marine-hull]
description: "One learning year sank a solar boat's learned seasonal correction at high latitude. Its month errors were no larger; its summer shape made the boat cautious."
---

A solar survey boat plans its battery use from a sun climatology, and the programme has been teaching it to correct that climatology month by month from its own log. Three milestones in a row turned up the same oddity. At the nine high-latitude points, a correction learned from one particular year (2007 when scoring 2010 to 2014, 2012 when scoring 2005 to 2009) beat the simple trailing-mean baseline in 1 case of 168. The year next to it won 153. Every other rule we tried collapsed on that year too.

Milestone 6zzl asks why. We committed seven predictions before the run, then patched the bad year's correction in pieces: one calendar month at a time, one local season at a time, its annual level only, or its seasonal shape only, each time borrowing the scored years' own ratios. The script first reproduced the earlier counts exactly (77, 153, 1, 124, 50 for the five single years). Two predictions held.

What came out:

- **It is not a worse estimate.** The bad year's month ratios are as close to the scored years' own as any year's: an energy-weighted mean error of 0.062, against 0.062 to 0.066 for the others. We predicted it would be the worst. It ties for best.
- **Every loss is on distance.** All 167 lost cases fail because the boat covered less ground than the baseline, never because it spent more hours with a flat battery. On the real climatology error it travels 0.64 to 0.93 of the baseline's distance with far fewer dark hours. The correction makes the boat cautious.
- **The damage sits in the local summer's shape.** Swapping in the scored years' own summer ratios recovers 87% of the gap. Fixing the annual level alone recovers 8%; fixing the shape alone, 84%. We had guessed winter, since that is when a high-latitude boat runs short. It was summer, when most of the year's energy arrives.
- **The count is not an accuracy score.** A correction learned in-sample on the scored years themselves wins only 103 of 168, well below the 153 of a year with no smaller error. So these high-latitude counts mostly measure which side of the baseline's distance a correction lands on. Per point the same corrections barely differ (42 to 49 of 72).

An exploratory look, written after the run and not a test: the two worst learning years are the only two that learned a brighter local summer than the scored years saw. One plausible path: expecting more sun, the adaptive rule reads an ordinary summer as a dark spell and holds back.

This changes how we read the last three steps. They said the raw month ratios "keep a real seasonal error" at high latitude that the pooled rules shrink away. Given this result, that reading needs restating as a trade between distance and dark hours, which those steps did not measure separately. The next step does: it scores each rule on both, and tests the summer mechanism with predictions written first.

For a team running solar boats at high latitude: judge a learned correction on distance and dark hours separately, and be wary of one learned from an unusually bright summer.

Limits: the in-sample correction is a five-year mean, not a per-year truth. The summer-sign link rests on five years, after the fact. Only the raw correction was diagnosed. This is simulation only, with calm water, daily steps, NASA POWER sunlight and one 4 m hull. Code, predictions and every number are in `research/marine-hull/` (milestone 6zzl). Written with AI assistance.
