# A sheet-following skill tuned on a rigid sheet fails on a flexing one with delay

**Date:** 2026-10-22. **Run:** research track, `research/buildbot-skills`. **Method:** random-search the three gains of
`buildbot-cohold`'s follow skill on a rigid-sheet plant with randomised sheet mass, lift time, lag and feed-forward error
(four seeds), then score it on 1000 fresh episodes of a second plant I wrote with a flexing board, a 5 to 50 ms force
actuator lag and 0 to 30 ms feedback delay. Numbers are from `research/buildbot-skills/experiments/results.txt`.

Tuned skills pass 81 to 82% of episodes on the plant they were trained on and 0 to 11% on the held-out one, because the
stiff, lightly damped gains they pick go unstable under delay. `buildbot-cohold`'s hand-set gains pass 61% then 26%.
A skill tuned on the held-out plant passes 61 to 66% there and 67 to 72% on the rigid plant, so one gain set can serve
both; reference lag is what limits it (89% under 0.15 s, 47% at 0.3 to 0.5 s). Randomising the parameters a simulator
has does not cover dynamics it lacks; the figure that decides usability is a real robot's force-loop delay, which I did
not find. Both plants are mine, so this is a probe of fragility, not a measure of sim-to-real error.
