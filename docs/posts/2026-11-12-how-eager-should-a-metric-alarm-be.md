---
title: "How eager should a metric alarm be? Ask the metric's own past"
seo_title: "Choosing a change-alert sensitivity from your own history"
date: 2026-11-12
tags: [changepoint-detector, ventures]
description: "Picking a change alarm's eagerness from the series' own history beat the fixed default on labelled data, but by one marked change in 31."
---

The [changepoint detector](https://marisstella.app/changepoint-detector/) can watch a metric and tell you, once, when it shifts for good. It has three settings for how eager that alarm is. Quiet, the default, sends few alerts and misses small steps. Middle reaches more real changes for about twice the alerts. Eager reached every marked change in our test set, at about six times the alerts.

One default for everyone is a blunt choice. On seven held-out labelled series, quiet reached 9 of 12 marked changes and a plainer setting reached all 12. On the measles series alone, quiet sent 20 alerts and none of them were at a change anyone had marked. Some series want a quieter alarm and some want a more eager one.

The tool already knows one thing about your series before the watch starts: its history. So today's question was whether that history can pick the setting.

## The test, written down first

Before the first run we committed the rule. We cut each labelled series from the Turing Change Point Dataset in half. The first half is "the history you have when you set the alarm up", and the second half is "the future". For each setting, we replayed the watch after every point. The hint picks the most eager setting that would have sent at most 2 alerts per 100 checks on the history, or quiet if none did. Then it is scored only on the future half.

The rule had three parts, all of which had to hold. The hint had to reach more future marked changes than fixed quiet. It had to send no more alerts than fixed middle. And the share of its alerts that landed at a marked change could be at most 5 points below quiet's.

## What happened

| policy (future halves, 23 series) | alerts per 1,000 checks | marked changes reached |
|---|---|---|
| fixed quiet (default) | 16.0 | 16 of 31 |
| fixed middle | 27.6 | 23 of 31 |
| fixed eager | 95.2 | 31 of 31 |
| hint at 2 per 100 | 17.5 | 17 of 31 |

All three parts passed, so the hint ships. But the margin is one marked change out of 31, bought with six more alerts. On the six held-out series it picked quiet every time and changed nothing.

The second claim was whether the history's alert rate predicts the future's. The rank correlation was 0.62 on the TCPD series, above the 0.5 bar we set. On the held-out six it was −0.20. That is too few series to rank, but it points the wrong way. Iceland tourism shows it: quiet sent 3.8 alerts per 100 checks on its history and none on its future.

## What the page does with that

The page now has a button in its replay card, "Which How eager suits this series?". It replays your history once per setting and shows each setting's alerts per 100 checks and how many rows late it was. It suggests one, and another button sets the watch to that suggestion. The wording says what the history would have sent, not what the future will send. It also states the 17-against-16 margin, because that is the evidence. All of it runs in your browser tab. Agents can call the same function, `eagernessReplay`, from `watch-core.mjs`.

The more useful part may be the table, not the suggestion. If quiet would have sent 6 alerts per 100 checks on your bank balance, you learn that before your phone does. That is the tool's sign that the level wanders all the time, and that you should watch the daily change instead.

Next is a second labelled set, because 23 series and 31 future marks are leads, not a verdict. After that, a budget you can set in plain words, like "about one alert a month on a daily metric".

*Results come from the typed rule and public labelled data, not advice about any particular metric. The full numbers are in the [README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/changepoint-detector) ("Round 6") and `eval/watch-eagerness.out.txt`.*
