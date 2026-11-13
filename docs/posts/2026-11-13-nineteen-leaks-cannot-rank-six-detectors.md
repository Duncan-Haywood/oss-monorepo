---
title: "Nineteen leaks cannot rank six leak detectors"
seo_title: "Leak detection benchmark scores depend on the matching window"
date: 2026-11-13
description: "On BattLeDIM, 3 of 6 leak detectors switch between beating chance and not as the match window changes, and no pair differs under a paired test."
tags: [research, water-leaks, leak-detection, BattLeDIM, benchmarking, statistics, multiple-testing]
---

The [previous step](/posts/2026-11-13-a-leak-scoring-rule-flips-the-ranking/) of the [water-leaks programme](/research/water-leaks/) found that one scoring choice flipped which leak detector looked best on the BattLeDIM L-Town benchmark. The choice was whether an alarm counts for a slow leak before that leak carries a real flow. This step asks how far that goes. It also asks whether any of the six detectors can be shown to beat another at all.

Nothing about the detectors changed. Each one keeps the alarms it raised at the threshold chosen on 2018. Only the scoring varied, over six rules: an alarm counts if it falls within 14, 30 or 60 days of a leak's start, with or without the requirement that the leak already carries 1 m³/h. Under each rule we placed the same number of alarms at random 1,000 times and asked how often luck matched the detector's count.

Three of the six detectors give different answers depending on the rule. Our pressure CUSUM beats chance (P below 0.05) under 2 of the 6 rules. The basic night-flow detector beats it under 4, and night flow corrected for smart meters under 3, all of them the gated rules. Our rebuild of LILA, a published method, clears 0.05 under all six. Correct for comparing six detectors at once, though, and it survives under only two. The other two night-flow variants never beat chance.

Then the head-to-head. All six detectors were scored on the same 19 leaks of 2019, so we can count, for each pair, the leaks one caught and the other missed. Under the main rule the corrected night flow finds 15 and the pressure CUSUM 11. The night flow alone finds 5 leaks the CUSUM misses, and the CUSUM alone finds 1. A sign test on that split gives P = 0.22. Over all 15 pairs, the smallest P after correction is 0.59. A bootstrap puts the 4-leak gap anywhere from 0 to 8. With 19 leaks, a four-leak lead is not evidence.

We wrote four predictions down before running this. Three held. The fourth said the pressure CUSUM would never beat chance, and it failed: with a 60-day window and no gate it finds 15 of 19 with no false alarms. A longer window credits more of its late alarms, and random alarms gain less from the extra days than the detector does.

One result held under every rule. The pressure sensor that raised each alarm sat within 300 m of the leak far more often than chance, with P below 0.001 every time. Location is the signal on this benchmark. A plain detection count depends on the scoring rule.

For anyone comparing leak detectors on BattLeDIM, the practical upshot is a short checklist. State the matching window and any flow gate. Report the chance level under that rule. Correct for the number of methods compared. Run a paired test before saying one method beats another. And if the test has no power, as it doesn't on one year of 19 leaks, say so. Next, the programme will pool more leaks so a paired test can decide something.

L-Town is a simulated network with simulated leaks; this is a statement about a benchmark, not about any utility. The six-rule table, the per-leak detections and the pre-registered plan are in [the project](/research/water-leaks/).
