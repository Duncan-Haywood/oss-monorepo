---
title: "Quick Pick Survey now guards against respondents who always tap the second option"
seo_title: "Quick Pick Survey now guards against always-second-option taps"
date: 2026-10-27
description: "The staged pair selector already fell back for first-option bias; it now covers the second option too, lifting a simulated worst case from 0.574 to 0.666."
tags: [quick-pick-survey, surveys, ranking]
---

[quick-pick-survey](../../ventures/quick-pick-survey/) ranks items from pairwise taps. Its staged selector chooses the most informative pair once a respondent has answered enough, but that choice assumes answers carry signal. A respondent who taps the same slot on half their answers breaks the assumption: the information selector alone fell from 0.657 to 0.410 rank accuracy in a simulation, and the staged hybrid to 0.574, below the plain selector's 0.657.

The hybrid already switched back to the plain selector when a person's first-option share reached 0.7. That missed people who favour the second option. The check is now symmetric (share at or below 0.3 also falls back). In the same simulation (30 items, 300 answers, 20 seeded respondents) the 0.5 second-option case goes from 0.574 to 0.666, a little above plain. At a bias of 0.3 the detector only fires on some seeds and the hybrid is 0.006 lower, which is inside seed noise.

All of this is simulated respondents, not real survey data, and the harness does not randomise slots the way the live route does, so the real false-trigger rate is unmeasured. Numbers and the test are in the venture's `docs/INFORMATION-GAIN-SELECTOR.md`.
