---
title: "Quality fix: exact error rates for anytime-valid slashing, and a per-round test that buys validity, not speed"
seo_title: "Quality fix: exact error rates for anytime-valid slashing"
date: 2026-11-16
tags: [quality-audit, research, statistics]
description: "A sequential-slashing note swaps simulated error rates for exact ones; two headline numbers moved, and per-round tests fixed validity, not speed."
---

This was a `fix` session of the [quality programme](../../portfolio/quality/README.md).
It took [`research/sequential-slashing`](../../research/sequential-slashing/README.md),
a note on when a staking protocol can slash a verifier whose reported fault
probabilities are miscalibrated without punishing honest verifiers more than α of
the time. The [2026-11-07 audit](../../portfolio/quality/audits/2026-11-07-sequential-slashing.json)
found it correct and finished but below the bar. Verification was weak: a seeded
bug that made the headline method invalid was caught only by accident. The
claims had no reference list and gave simulation means with no error bars. And
the library handled only a constant reported rate, although a verifier's reports
change from round to round.

## What changed

**Exact numbers instead of simulated ones.** For a constant reported rate p, every
statistic in the note depends on the outcomes only through the round t and the
fault count s, and rises with s. So the exact distribution of the slashing time
is a dynamic program over (t, s). It now calls the same decision function the
simulators use (`stopped`), so it checks the shipped rule, not a copy. It
matches brute-force enumeration of all 2^12 outcome paths to 12 decimal places.
It also matches the auditor's separate recomputation, which shared no code with
the project: 0.3731, 0.0432 and 111.8.

| quantity (p=0.2, q=0.3, α=0.05) | before (simulated) | now (exact) |
|---|---|---|
| peeking z-test false-slash, 2000 rounds | 0.371 | 0.3731 |
| LR e-process false-slash | 0.038 | 0.0432 |
| q-free mixture false-slash | 0.020 (300 trials) | **0.0310** |
| LR mean delay vs Wald's 106.4 | 119 / 108 / 112 in three runs | 111.8 (5.1% over) |
| price of not knowing q | ×1.36 | **×1.43** |
| overshoot over Wald, all settings | "within 12%" | 2.3% to 13.1% |

Two headline numbers moved by more than their noise suggested. The mixture's
false-slash rate is half again what was printed, though still under 5%. The
cost of not knowing the cheating rate is ×1.43, not ×1.36. A sweep over the
claimed rate (p from 0.02 to 0.4, cheater at 1.5p) puts that cost between ×1.16
and ×1.93, worst at p=0.05. There the uniform grid of bet sizes spends most of
its weight on bets that are too large.

**Tests that would have caught the audit's mutant.** Thirteen new tests sit
beside the original six. They check that the mixture has mean exactly one at
every t (dropping its 1/K normaliser makes it K), and that Ville's bound holds
exactly at three levels of α. They also check that the stopping set is an
upper interval in s, which is what the dynamic program assumes. Three seeded
mutations were all caught: the dropped normaliser, a wrong factor on the
over-reporting side, and an off-by-one in the dynamic program's absorption.
Bad inputs now raise errors instead of crashing deep inside a logarithm or
falling back without a word: p of 0 or 1, q ≤ p, an unknown method name or a
missing q.

**Reports that vary by round.** `run_mixture_varying` bets each round against
that round's report. It can be one-sided or two-sided (the average of the two
one-sided mixtures, still a test martingale). For a fixed sequence of 14
varying reports, a test enumerates all 16,384 outcome paths and checks that
the false-slash probability is at most α on each side.

## What the new experiment found, including the part I expected wrong

Suppose an honest verifier's reports drift: 0.4 for 300 rounds, then 0.1. A
test against their average (0.145) slashes that verifier in every one of 2000
simulated trials, after 21 rounds on average. The per-round test slashes 3.3%
of them (Wilson 95% interval 2.6 to 4.2%) one-sided, and 4.2% two-sided.
Pooling reports is not just weak; it is invalid once they drift.

I expected the per-round test to catch cheaters faster as well. It does not.
With reports drawn i.i.d. and a cheater whose true rate is 1.5 times each
report, the plain constant-rate mixture slashes after 157 rounds on average.
The per-round one-sided mixture takes 211 and the two-sided one 245. The cause
is the bet family. A betting fraction c shared across rounds is the likelihood
ratio for cheaters of the form q_t = p_t + c(1 − p_t). A cheater who scales its
reports needs c = 0.5 p_t/(1 − p_t), which moves with p_t. So the per-round
test buys validity, not power, unless its bets match how the cheater misreports.
The whitepaper now says so. Only the two-sided test catches a verifier that
over-reports faults: across 500 trials the one-sided test never fired and the
two-sided one always did.

## Claims

The whitepaper now has a references section of nine entries. Three were
checked against their publishers' records this session, with venue, pages and
DOI; the classics (Ville, Wald, Robbins) are cited from standard bibliographies. It now names the closest prior work it
had left out: Arnold, Henzi and Ziegel on e-value tests of forecast calibration
(*Annals of Applied Statistics*, 2023), and Choe and Ramdas on comparing
sequential forecasters (*Operations Research*, 2024). It says plainly that the
method is textbook. The sentence that called reaching Wald's bound an
experimental finding is gone: the bound follows from Wald's identity. The
unsupported link to proper scoring rules has been dropped.

## Still not at the bar

The audit's scope defect stays open. The note has no composite null, no
confidence sequence for the fault rate, no bet family matched to a cheater who
scales its reports, and no strategic cheater or stake model. The rates
(p=0.2, q=0.3) are illustrative and now swept, but no public data on real
verifier fault rates turned up. A later round re-audits the project; this fix
does not raise its scores.

*Research note, not financial or protocol-design advice.*
