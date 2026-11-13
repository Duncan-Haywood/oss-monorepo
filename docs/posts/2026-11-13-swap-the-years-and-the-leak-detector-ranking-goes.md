---
title: "Swap the tuning year and the leak-detector ranking goes"
seo_title: "Cross-fitted leak detection on BattLeDIM: 2018 vs 2019"
date: 2026-11-13
description: "Tuned on 2019 and tested on 2018, BattLeDIM leak detectors lose their ranking: on 32 held-out leaks none beats chance after correction under a flow gate."
tags: [research, water-leaks, leak-detection, BattLeDIM, cross-validation, multiple-testing, water-loss]
---

Every result so far in the [water-leaks programme](/research/water-leaks/) used the same split as the BattLeDIM competition: tune on 2018, test on 2019. The [last step](/posts/2026-11-13-nineteen-leaks-cannot-rank-six-detectors/) found that 19 test leaks can't separate six detectors. So this step reversed the split. Each detector's threshold was picked on 2019 with the same rule, then 2018's 13 leaks were scored once. Together with the original split, that gives 32 leaks, each scored by a setting chosen without seeing its label. The plan and four predictions went into the log before anything was scored.

**The thresholds don't hold still.** Five of the six detectors pick a different setting when the tuning year changes. The night-flow detector that combines the weekday and smart-meter fixes (M4) goes from a CUSUM threshold of 3 to 30. Only the pressure CUSUM keeps its setting.

**The step-8 winner doesn't repeat.** Under the flow-gated rule, the smart-meter-corrected night flow (M3) found 15 of 2019's 19 leaks, with a chance P of 0.001. That was the strongest result in the programme. On 2018, with a threshold picked on 2019, it finds 6 of 13. The pressure CUSUM finds 8, and our automatic rebuild of LILA finds 9.

**Pooled, nothing beats chance after correction.** Each detector's 32-leak count was compared with what the same number of random alarms scores. The P values were then corrected for the six detectors compared. Under the gated rule, the smallest corrected P is 0.27. LILA (22 of 32) and M3 (21 of 32) both sit at about 0.05 before the correction. Under the old ungated rule, one count survives: LILA, at 24 of 32 (corrected P = 0.024). The flow gate is what removes it.

**Still no pair separates.** With 32 leaks, the paired sign test between any two detectors gives a smallest corrected P of 0.86. M3's lead over the pressure CUSUM shrinks from 4 leaks to 2, with a 95% bootstrap interval of −4 to +8.

Three of the four predictions held. The one that failed was that M3 would beat chance after correction.

For the paper, this adds a clause to the scoring protocol. A detection-only comparison on L-Town should report its matching rule, the chance level under that rule, a correction across the methods compared and a paired test. It should also cross-fit thresholds across the two years. Without that last clause, a ranking can just mean one detector suited one year better. Thirty-two leaks are still too few to rank anything, so the next statistics step needs simulated leak years from the full L-Town model. L-Town is a simulated benchmark, and none of this is advice for running a real network.

Code, results, the per-leak table and the pre-registered plan are in [the project](/research/water-leaks/), step 10.
