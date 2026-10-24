# Robot Town: generating honest, watchable episodes from a trust simulation

*Research track 17 (`society`), milestone 7. Produced with AI assistance (Claude). Fiction: the
people and robots are invented and nothing depicts a real person or event.*

## Abstract

A simulation of people's trust in a robot fleet (`society-trust`) is turned into five seeded
browser episodes. Turning points are detected from the recorded trust of every person in every
round, and the narration is a template filled from the same record, so each sentence is checkable.
With the settings used, even-handed gossip recovers 46 rounds after the fix, gossip that weighs
bad news 4× locks the town out (48 of 48 avoiding working robots at round 399), explaining failures
recovers in 29 rounds with nobody avoiding, and at 2× the same settings recover on seed 0 and lock
out on seed 1. Episodes illustrate; they are single runs.

## 1. Method

Dynamics as in `society-trust` (reliance with probability equal to trust, success and failure
updates, pairwise gossip with negativity bias β, avoidance below θ = 0.30), rewritten to record the
full trust matrix; a test checks mean trust equals `society_trust.simulate` exactly. Detector:
first round any person is below θ, first round half the town is, lowest mean trust within the
incident window, the fix, and recovery (mean within 0.05 of the pre-incident level) or lock-out at
the end of the record. Narration: one sentence per detected point. Cast: invented first names,
shuffled by seed.

## 2. Results

See the README table: five episodes, one seed each, endings and avoider counts. A throwaway ten-seed
check at the same settings gave 10/10, 10/10, 10/10 and 5/10 recoveries for the four settings, and
is not a saved result.

## 3. Limits

Stylised model; templated narration cannot explain why individuals change; episodes were chosen to
show the model's behaviours; no viewer study.

## References

Hancock, P. A., et al. (2011). A meta-analysis of factors affecting trust in human-robot
interaction. *Human Factors*, 53(5), 517–527.
