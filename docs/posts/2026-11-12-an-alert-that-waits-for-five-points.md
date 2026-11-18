---
title: "An alert that waits for five points: watching a metric for lasting changes"
date: 2026-11-12
tags: [changepoint-detector, time-series, monitoring, pre-registration, self-hosting]
description: The changepoint detector now watches a daily metric and messages you once per new change. Defaults picked by replaying 6,369 labelled checks.
---

Most people who ask "did this metric change?" ask it more than once. They ask every Monday. The [changepoint detector](https://marisstella.app/changepoint-detector/) answered it once per paste. It now has a watch mode. `watch.mjs` runs after each new row of a CSV, refits the series and posts to Slack, Discord, Teams or Mattermost when the level has changed. It posts once per change, after five points sit on the far side of it. A [setup script](https://marisstella.app/changepoint-detector/watch-a-metric-for-changes.html) writes a standalone repository with a daily GitHub Actions job, so the watch runs in your own account and nothing goes through us.

The hard part is not the plumbing. It is deciding when a change is real enough to interrupt someone. A refit on day 204 can find a step that day 205 moves by two points and day 210 drops. So we replayed series one point at a time, the way a cron job sees them, and counted every message a person would have got.

**Round 1.** We wrote the rule down before running anything. There were three detectors: PELT's level model, PELT's level-and-volatility model, and the engine's Bayesian online detections. Each was tried waiting for 3, 5 or 10 points. Of those that reported at least 90% of 2-standard-deviation steps, the winner would be the one with the fewest false alerts on three kinds of noise with no change. The Bayesian detections waiting five points won. On sticky (AR(1)) noise they sent 7.5 false alerts per 1,000 checks, where PELT sent 49.75. They also missed every 1-sd step, which PELT mostly caught.

Then the real test, scored once without changing anything. We replayed the 31 Turing Change Point Dataset series, each marked by five human annotators: 6,369 daily checks. The default sent 193 alerts, a third of them at a change an annotator marked, and reached 38 of the 52 changes most annotators agreed on, a median 5 points late. PELT reached all 52 but sent 626 alerts, about one every ten checks. One series, a bank balance, produced 42 of the default's alerts and none of them at a mark. A level that never holds still will keep alerting, and the page says so.

**Round 2, failed.** A unit test then turned up a clear 3-sd step that the default never reports. Its probability was spread over neighbouring points (0.15, 0.03, 0.17, 0.36), so no single point reached the 0.5 bar. Summing over five neighbours fixes that case. We pre-registered it against fresh seeds. It reported 10 of 10 two-sd steps where the default managed 6. But it doubled the false alerts on sticky noise, 15 per 1,000 checks against 7, and the rule allowed at most one more. So it is an option (`--detector bocpd-window`), not the default.

The fresh seeds also showed that round 1's pass was partly luck. Across both rounds the default reported 15 of 20 two-sd steps, short of the 90% the first rule asked for. We kept the default as pre-registered and put the trade on the page in a table: it stays quiet and misses small steps. If a missed change costs you more than a false alarm, `--detector pelt` is one flag away.

Next is a Bayesian pass that knows about sticky noise, which is exactly where the windowed version lost. Every number, both rule texts and the replay script are in the [README](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/changepoint-detector/README.md#watching-a-growing-series-2026-11-12-two-pre-registered-rounds-ships).
