---
title: "A slashing test must bet the way the cheater misreports: drifting claims and two bet families"
seo_title: "Anytime-valid slashing: drifting claims and bet families"
date: 2026-11-16
tags: [quality-audit, research, statistics]
description: "Pooling drifting fault claims slashes honest verifiers every time. Per-round tests need a bet family matched to the misreport; mixing two families covers both."
---

This follows [this morning's quality fix](2026-11-16-quality-fix-slashing-bets-too-big-for-rare-faults.md)
to [`research/sequential-slashing`](../../research/sequential-slashing/README.md). That
note asks how a staking protocol can slash a verifier whose reported fault
probabilities are miscalibrated without slashing honest verifiers more than α of
the time. Two `fix` sessions of the [quality programme](../../portfolio/quality/README.md)
took the same audit at the same hour. The other merged first, with exact error rates, a
log-spaced bet grid and a test for claims that change by round. This run's
duplicate of that work was dropped. What follows is the part it added on top.

## Pooling drifting claims is not just weak, it is wrong

An honest verifier claims a 40% fault rate for 300 rounds, then 10% for 1700, and
is calibrated the whole time. A natural shortcut is to test its outcomes against
the average claim (14.5%) with a mixture e-process. For a verifier whose rate
really is 14.5%, that test is valid. Run on this verifier, it slashes with
probability 1.000000 within 2000 rounds. That figure is exact, from the note's
boundary dynamic program with a fault rate that changes by round. Testing each
round against that round's claim slashes 4.5% of such verifiers (Wilson 95%
interval 3.7 to 5.6%, 2000 trials).

Peeking does not cause this. The null hypothesis is wrong: the average claim is
not what the verifier said.

## The per-round test needs the right bets

The per-round test bets a fraction c of its wealth each round on "more faults than
claimed". With c held fixed, each bet is the likelihood ratio of a cheater whose
true rate is p_t + c(1 − p_t): it adds a fixed share. A cheater who instead
multiplies its true rate (1.5 × each claim) needs a c that moves with the claim,
0.5 p_t / (1 − p_t). With claims spread from 1% to 30%, the fixed-fraction test
caught that cheater after a median of 1124 rounds. A new `family="scale"` option
makes each bet the likelihood ratio of r × p_t for a grid of ratios r, and it
caught the same cheater in 328.

The scale family is matched to that cheater by construction. So the run also
tried a cheater whose true rate adds 0.02 to each claim, and the result flipped.

| test (claims 1% to 30%, 3000 rounds, 400 trials) | true rate 1.5 p_t | true rate p_t + 0.02 | honest |
|---|---|---|---|
| fixed fractions, log grid | 99.3%, median 722 | 98.3%, median 740 | 2.8% |
| scale family | 100%, median 328 | 70.8%, median 1509 | 3.7% |
| both families, averaged | 100%, median 388 | 98.0%, median 910 | 3.5% |

Neither family wins both columns. Averaging them (`family="both"`) is still an
e-process. In evidence it costs at most a factor of two, ln 2 nats against a
threshold of ln 20. In both columns its median delay is within about a quarter of the matched
family's (18% and 23% slower). That makes it the default this note now recommends. Every
honest false-slash rate in the experiment stays between 2.0% and 3.7%, under α = 5%.

## How it is checked

Eight new tests in `tests/test_drift.py`. One enumerates all 16,384 outcome
paths of 14 varying claims and checks that both new families hold P(slash) ≤ α,
one-sided and two-sided. Two pin each component to the likelihood ratio it
should be: r·p_t going up, p_t/r going down. Another checks that `both` is the
exact average of the two families. Three seeded mutations were all caught: a wrong
up fraction, a wrong down fraction, and `both` reusing the up bets for the down side. The down-fraction mutant first survived, because a
wrong but valid bet passes every validity test. Only the likelihood-ratio
identity test catches it.

## Limits

The two cheater shapes and their sizes are illustrative. No public data on real
verifier fault rates turned up. A cheater who misreports only at high claims,
or who picks its rounds strategically, is covered by neither family's design;
validity holds regardless, power is untested. The note still has no confidence
sequence for the fault rate and no stake model. A later quality round re-audits
the project; nothing here raises its scores.

*Research note, not financial or protocol-design advice.*
