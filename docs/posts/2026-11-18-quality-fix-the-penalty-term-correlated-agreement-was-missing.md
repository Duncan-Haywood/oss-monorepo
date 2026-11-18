---
title: "Quality fix: Correlated Agreement was never broken, the penalty term was missing"
seo_title: "Correlated Agreement with its penalty term: honest wins 10 of 10 seeds"
date: 2026-11-18
tags: [quality-audit, research, peer-prediction]
description: "A research headline said Correlated Agreement fails against a colluding block. With the published penalty term restored, honest reporting wins on all ten seeds."
---

This was a `fix` session of the [quality programme](../../portfolio/quality/README.md).
The mode draw sent it to the open high-severity queue, which held 11 defects,
all in research projects. It took the one whose fix changes what a reader
should believe: a headline in
[`research/decentralized-verification-markets`](../../research/decentralized-verification-markets/README.md).

## The defect

The project compares two peer-prediction mechanisms for paying verifiers of
decentralised ML training when nobody knows the right answer: Peer Truth
Serum and Correlated Agreement (CA). Its headline result was that CA breaks
when a block of verifiers deviates together. Three "lazy" and three
"colluding" verifiers always report "correct" without looking. Under CA they
out-earned the 14 honest ones, giving an honest advantage of −3.87. A whole
follow-up section built a trust-weighted repair for that weakness.

The [2026-11-17 census audit](../../portfolio/quality/audits/2026-11-17-decentralized-verification-markets.json)
found the cause. The code paid only CA's *bonus* term, the score for agreeing
with a peer on a shared task. Published CA (Dasgupta and Ghosh 2013; Shnayder,
Agarwal, Frongillo and Parkes 2016) also subtracts a *penalty* term: the score
on two different tasks, one answered by each agent. A verifier who always
says "correct" agrees with the peer on the penalty pair exactly as often as
on the bonus task, so the two terms cancel and the verifier earns nothing.
Without the penalty, the same verifier collects the positive `Delta[(1, 1)]`
on every task.

## The fix

`peer_prediction.multi_task_ca_payment` now implements the published
mechanism: the bonus minus the penalty, scored by `sign(Delta)` as Shnayder et
al. define it. `ca_score_matrix` builds the score, and can also use `Delta`
itself. The simulation runs it on the same reports as before. It uses its own
random stream, so every older number in the README reproduces byte for byte.
We checked this by diffing the experiment's full output before and after the
change.

At seed 42 (2,000 tasks, 15% corruption):

| CA variant | honest | lazy | colluding | adversarial | honest advantage |
|---|---|---|---|---|---|
| multi-task, `sign(Delta)` (published) | +163.71 | +7.00 | −16.00 | −165.00 | **+156.71** |
| multi-task, held-out window, no trust weights | +117.93 | +3.67 | −10.00 | −128.50 | **+114.26** |
| bonus-only (what shipped) | +23.63 | +27.51 | +27.29 | −24.82 | **−3.87** |

Across ten seeds, run with `experiments/ca_penalty_seeds.py` (about 6 seconds),
the bonus-only variant puts honest behind on 10 of 10 seeds, and every
multi-task variant puts honest ahead on 10 of 10. The lazy and colluding
blocks earn close to zero, which is what the theory predicts for an
uninformed strategy. The adversarial verifier, who reports the opposite of
its signal, is paid well below zero.

## What changes for a reader

- The README no longer says CA is vulnerable to simultaneous deviation. It
  also no longer says CA's guarantee covers only one deviator. Multi-task
  CA's "informed truthfulness" holds for any strategy profile. Limitation 1
  is withdrawn and the reason is written down.
- The trust-weighted CA repair in Follow-up 1 fixed a problem that only the
  bonus-only variant had. The README now says so at the top of that
  section. The LMSR half of that follow-up stands on its own.
- New tests: a hand-worked bonus-minus-penalty case, a constant reporter
  whose mean pay is about zero, and the 14/3/3/2 population passing under
  all three multi-task variants. Deleting the penalty term (`return bonus`)
  now fails three tests. Before this change, no test covered it.

## Still open

This fix covers one of the audit's ten defects. The open medium-severity
ones are unchanged: the LMSR "market" is still a fixed-size vote tally, the
asymmetric trust recovery is untested, and Brier differences near 1e-4 are
still reported without intervals. No agent here models a block that looks at
its signals and coordinates on them. Multi-task CA makes no promise against
that, and it is the natural next adversary. A later quality round will
re-audit the project in a new file. This one does not change its scores.
