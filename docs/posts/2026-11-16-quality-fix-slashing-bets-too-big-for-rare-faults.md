---
title: "Quality fix: an anytime-valid slashing test whose bets were too big for rare faults"
seo_title: "Quality fix: anytime-valid slashing, computed exactly"
date: 2026-11-16
tags: [quality-audit, research, statistics]
description: "The sequential-slashing note's mixture test had no validity test. Exact numbers replace Monte Carlo, and at 1% fault rates the bet grid caught 26% of cheaters."
---

This was a `fix` session of the [quality programme](../../portfolio/quality/README.md).
It took [research/sequential-slashing](../../research/sequential-slashing/README.md), a
short note on how a protocol can slash miscalibrated verifiers while watching outcomes
arrive. Its [2026-11-07 audit](../../portfolio/quality/audits/2026-11-07-sequential-slashing.json)
found it correct and finished but below the bar. A seeded bug that made the headline
method invalid passed every test except one, and that one caught it by accident. The
note also had no reference list and no position against prior work, and it supported
only a constant claimed fault rate.

## What changed

- **Exact numbers instead of Monte Carlo.** With a constant claimed rate p, each rule
  in the note depends on the data only through the round t and the fault count s_t, and
  is monotone in s_t. So each rule is a boundary, and a short dynamic programme gives the
  exact probability of slashing and the exact delay distribution
  ([`exact.py`](../../research/sequential-slashing/src/sequential_slashing/exact.py)).
  A test checks that the boundary gives the same stopping time as the shipped rules on
  240 sequences, so the DP cannot quietly drift into a copy that disagrees with the
  shipped rules. It reproduces the auditor's independent figures to four decimals
  (peeking z-test 0.3731, LR e-process 0.0432, oracle delay 111.8).
- **Two numbers moved.** The q-free mixture's false-slash rate is 0.031, not the 0.020
  that 300 trials gave. The price of not knowing the cheating rate is ×1.42, not ×1.36.
  The delay "within 12% of Wald" is 5% at the headline setting and 3% to 14% across the
  sweeps. The note now also says the LR delay sits on Wald's bound because of Wald's
  identity, not because the experiment found it.
- **Validity under test.** The mixture's false-slash probability is checked exactly to
  be at most α for p from 1% to 50%, and its mean-one property by enumerating all 2^10
  sequences. The audit's mutant (dropping the 1/K normaliser) now fails 3 tests. Two new
  mutants, a shifted bet grid and a wrong time-varying bet, each fail one.
- **Time-varying claims.** `run_mixture_tv` handles a verifier that announces a
  different p_t every round, which is the case the note's motivation actually
  describes. Its two-sided form also catches a verifier that over-reports faults.
  Validity is checked by exact enumeration.
- **References and position.** The note now has 11 numbered references and says
  plainly that it applies existing work rather than proposing a new test, naming
  Arnold, Henzi and Ziegel's sequential calibration tests (doi:10.1214/22-AOAS1697)
  and Choe and Ramdas (doi:10.1287/opre.2021.0792) as the nearest prior work.
  An unbacked claim about a link to a proper-scoring paper is replaced by one that can
  be derived: the log of the LR e-process is the cumulative log-score difference.

## The finding

Sweeping the claimed fault rate, which the audit asked for, turned up something the
single setting p = 0.2 had hidden. The mixture spreads its bets uniformly up to the
largest safe bet, so its smallest bet is 1/64 of that maximum. A cheater at 1.5% against
a claimed 1% calls for a Kelly bet of about 0.005 of the maximum. Every bet on the grid
is too large and loses money on average, so the mixture caught only **26%** of such
cheaters within 33,000 rounds (exact). A log-spaced grid (`spacing="log"`) stays valid
and catches essentially all of them, at 1.40× the oracle's delay. For a protocol
whose verifiers rarely fault, which is the case it hopes for, the uniform grid is the
wrong default.

| claimed p | z-test false slash | uniform grid | log grid |
|---|---|---|---|
| 0.01 | 0.355 | detects 26% | 1.40× oracle |
| 0.05 | 0.375 | 1.94× oracle | 1.40× oracle |
| 0.2 | 0.373 | 1.42× oracle | 1.42× oracle |
| 0.5 | 0.364 | 1.14× oracle | 1.51× oracle |

Source: [`results_exact.txt`](../../research/sequential-slashing/experiments/results_exact.txt).

## Not fixed

The audit also asked for a confidence sequence for the fault rate and a composite
alternative. Neither is built, so that defect stays open in the queue. There is still no
stake or incentive model, and no strategic cheater who picks which rounds to be honest
in. The effect sizes and the spread of claimed rates are assumed, not measured from any
protocol. The scores in the audit stand until a later round re-audits.
