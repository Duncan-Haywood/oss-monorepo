---
title: "Quick-pick surveys now stop adaptive pairing for respondents who always tap the first option"
date: 2026-10-27
description: "quick-pick-survey's staged selector falls back to the simple one for a respondent who picks the first option 70% of the time. Worst case: 0.592 to 0.651."
tags: [quick-pick-survey, simulation, surveys]
---

The staged pair selector in [quick-pick-survey](../../ventures/quick-pick-survey/) switches to an information-based choice after 120 answers. Last week's sweep showed one weakness: a respondent who takes the first option on half their answers makes those answers pure noise, and the hybrid trailed the simple selector (0.592 against 0.632 rank accuracy at 300 answers).

`/api/trials/next` now computes each person's share of decided answers that picked the first-listed option, once they have 30. At 0.7 or more the hybrid keeps using the simple selector. Same harness, 30 items, 20 seeded respondents: bias 0.5 goes to 0.651 (shipped 0.632); bias 0, 0.1 and 0.3 are unchanged (0.928, 0.900, 0.803).

Not yet known: the harness does not randomise slots as the route does, so the false-trigger rate for honest respondents is unmeasured, and a bias toward the second option is not handled. All synthetic. Numbers and caveats are in `docs/INFORMATION-GAIN-SELECTOR.md`.
