---
title: "Two weak signals, one good trigger: the audit floor that spares good LLM coders"
seo_title: "LLM coding audits: a J_hat and miss-count floor trigger"
date: 2026-11-16
tags: [research, llm, statistics, qualitative-coding, survey-sampling]
description: "Pre-registered, 130 cells: flooring only pilots with few coder misses and a low J_hat keeps 94.6% of the gain and is now the default."
---

The [llm-coding-inference](../../research/llm-coding-inference/) programme asks how
few hand-coded items you need for an honest confidence interval on a category's
share once a language model has coded the whole corpus. The shipped audit rule
hand-codes a pilot. If the model looks informative, it splits the rest of the
audit by the model's own label, and that split is where it saves labels.

The rule has a known flaw. With a weak coder, the audits that choose the split can
undercover. The cause is a pilot that happens to see few of the coder's misses,
which makes the coder look better than it is and shrinks the variance the
interval uses. This morning's milestone
([7ay](2026-11-16-conditional-floor-good-coders-pay.md)) tried inflating that
variance only when the pilot shows 3 or 4 misses. It repaired the cells it aimed
at, but good coders paid for it. A good coder also shows few misses, because it
rarely misses.

## The idea

A good coder and an unlucky weak coder can both show 3 or 4 misses, but their
pilots look different on a second number: J_hat, the pilot's sensitivity plus
specificity minus one. A good coder's J_hat sits near its true value, 0.40 to
0.78 here. The unlucky weak-coder pilots that failed averaged 0.41 to 0.48. So
the new trigger fires only when **both** signals are weak: fewer than 5 misses
**and** J_hat under a ceiling. The prediction and decision rule were committed
before any draw
([`h7az_joint_trigger.py`](../../research/llm-coding-inference/experiments/h7az_joint_trigger.py)).
There were three ceilings (0.40, 0.50, 0.60) and 130 cells, 16 of them fresh audit
sizes, with 1,000 simulated audits each.

## What happened

| Rule | Floor fired (of 65,289 split audits) | Failing cells left | Repaired cells' coverage given the split | Width gain kept |
|---|---|---|---|---|
| Shipped, no floor | 0 | 10 | 82.5 to 87.8% | 100% |
| Under 5 misses (7ay) | 11,697 | 6 | 96.6 to 100% | 79.7% |
| Under 5 misses and J_hat < 0.40 | 2,224 | 6 | 90.8 to 92.8% | **94.6%** |
| Under 5 misses and J_hat < 0.50 | 4,240 | 6 | 93.1 to 97.5% | 90.0% |
| Under 5 misses and J_hat < 0.60 | 6,017 | 6 | 95.4 to 100% | 86.5% |

The good coders were spared. On the four fresh cells with the strongest coders
(gratitude and love, J 0.75), the 0.40 trigger fired in none of 1,000 audits. The
miss-only trigger fired in 185 to 451 of them. Good coders kept 97.9% of their
gain, against 84.0% under the miss-only trigger.

Two candidates passed the pre-registered rule: 0.40 and 0.50. The rule picks the
one that keeps more gain, so **the library default is now the 0.40 trigger**
(`NEG_FLOOR = (5, 0.40, 2)` in `plan_audit`). Every earlier experiment is pinned
so it replays as committed, and a test checks that the library matches the
experiment draw for draw.

## What it does not fix

There are two honest caveats.

First, the cheapest qualifier is also the weakest repair. It lifts the four
target cells to 90.8 to 92.8% coverage given the split, not to 95%. The 0.50
ceiling repairs more for 4.5 points of gain, and that trade-off is the reader's
to weigh.

Second, six cells stay broken under every candidate. They are weak coders
(J 0.12 to 0.23) whose failing pilots show many misses and still under-see them.
Two of the six are new: annoyance and approval at an audit of 750 cover 62.5%
and 72.8% given the split. No pilot statistic tried so far reaches them: J_hat,
its lower bound, the miss count, or the two together. The next step is evidence
the pilot does not hold, such as a check on labels drawn after it.

The fresh cells mostly test the cost, not the repair. They use the same coder
family on known categories at new sizes, and at those sizes the target failure
was rare. A check on a second corpus with other coders comes next.

Code, draws and summary:
[`experiments/h7az_joint_trigger.txt`](../../research/llm-coding-inference/experiments/h7az_joint_trigger.txt).
The [log](../../research/llm-coding-inference/LOG.md) has every prediction,
including the one I got wrong (I guessed the 0.40 ceiling would repair only one
or two cells).
