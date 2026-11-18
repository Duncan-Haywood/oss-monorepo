---
title: "Finer server data made a change watch faster, not better at catching short incidents"
seo_title: "10-minute vs hourly server metrics for alerts: a pre-registered test"
date: 2026-11-15
tags: [changepoint-detection, monitoring, pre-registration, negative-result, smd]
description: "Pre-registered on three SMD servers: 10-minute data did not help alert floors keep short incidents, but cut the median alert delay from 4 hours to 1."
---

Earlier today the [changepoint detector](https://marisstella.app/changepoint-detector/)'s watch failed a test on the Server Machine Dataset (SMD): 28 servers, about 30 metrics each, with labelled incidents. On hourly data, every automatic floor that kept false alerts near the budget of 2 per 100 checks also lost most of the incidents that the unfloored watch caught. Two thirds of SMD's incidents last under an hour, and an hourly average shrinks a 10-minute spike to a sixth of its size. So the obvious question: was the failure just the hourly averaging?

We wrote down the test before running it. Same pipeline, same three servers (the first of each SMD group, picked by name), same alert budget per hour. Only the bucket changes: hourly, or 10-minute data checked once an hour. A floor "explains" the miss if on 10-minute data it keeps Quiet's catches less 6%, and "explains part of it" if its share of Quiet's catches rises 20 points.

| 24 labelled incidents | hourly: caught | hourly: median delay | 10-minute: caught | 10-minute: median delay |
|---|---|---|---|---|
| no floor | 22 | 4 h | 24 | 0.7 h |
| one spread floor | 12 | 4.5 h | 12 | 1.1 h |
| loud-column split | 14 | 4 h | 16 | 0.8 h |
| rolling move floor | 4 | 4.5 h | 9 | 1 h |

Neither line was met by any floor. The rolling floor's share went from 18% to 38%, short of the 20-point line by 0.7. The floors caught 3, 7 and 1 of the 14 incidents under an hour on 10-minute data, about what they caught hourly. Finer data mostly helped on the longer incidents.

What did change is speed. Every setting's median time from an incident's start to its alert fell from about four hours to about one. A step shows up within a few 10-minute points instead of after several hourly ones. Without a floor, the 10-minute watch on 30 metrics is also five times louder (408 alert lines per 100 hourly checks), so you still need to choose which metrics to watch.

The takeaway for anyone watching server metrics with this tool is the same as this morning's, with one addition. Pick the few metrics that matter. Floor the loud ones by hand. Feed it the finest data you have, because that makes the alerts you do get arrive hours sooner. Short spikes across every metric on a box are anomaly detection, and this watch does not claim to do that.

Three servers and 24 incidents is a small sample. The code, the pre-registration and the full output are in the tool's README ("Round 19") and `eval/watch-smd-10min.out.txt`.
