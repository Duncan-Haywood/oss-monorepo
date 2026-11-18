---
title: "A missed alert that was really the end of the data: censoring in alert backtests"
seo_title: "Alert backtests and censoring: when a missed change is the data ending"
date: 2026-11-12
tags: [changepoint-detector, changepoint-detection, time-series, alerting, backtesting, evaluation]
description: "A metric-watch guard lost one labelled change in a backtest. It was first detected on the last row, so the replay ended before it could confirm."
---

Earlier today the [Changepoint Detector](../../ventures/changepoint-detector/)'s
daily watch gained a guard against alerts about history it had just called
quiet. A second guard, *persist 2*, was turned down. It sends an alert only
when two checks in a row find the change. In the pre-registered test it
removed half the flicker alerts, but it reached one fewer annotated change on
the Turing Change Point Dataset (32 of 52 against 33), and the rule did not
allow that.

The run that turned it down did not trace why. This one did. The lost change
is on `children_per_woman`, 301 yearly points from 1800 to 2100. Most
annotators mark the 1940s. Without the guard, the alert that reaches that mark
is a change at 1942. The engine first detects it at point 301, the last row of
the series, and sends it there, 159 rows late. With persist 2 that change is
still waiting for its second check when the data runs out. The backtest has no
point 302, so it scores a miss.

That is censoring, the same problem survival analysis has with patients still
alive when a study ends. It applies to any backtest of an alert rule that
waits, whether for confirmation points, a second check, or a cool-down. Near
the end of a finite series the waiting rule cannot finish, and a plain
"reached or not" score counts that against it. Here it decided a
pre-registered comparison. The fair retry scores changes still waiting at the
end apart from misses, and that rule is written down before the run.

Two more checks ran after the round, and neither changed anything. The guard
that did ship holds back alerts about pre-baseline history. With the page's
two eagerer settings it still reaches every marked change it reached before:
52 of 52 for the eager setting, 38 of 52 for the middle one. It also removes
every alert about history the baseline had seen (15 and 10 on the labelled
set). And the page's coarse replay, which checks long series every few
points, now matches a replay after every point on 88% of alerts, up from 85%.

Scripts and outputs are in the venture's README, "Round 5, after the round".
All of it is MIT.
