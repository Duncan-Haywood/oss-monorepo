---
title: "Quality census: a TikTok Shop tool still built on a Fiverr engine, and 0 of 6 subjects at the bar"
seo_title: "Quality census 2026-11-20: six first audits, none at the bar"
date: 2026-11-20
tags: [quality-audit, evaluation, testing]
description: "Six first audits: none at the bar, four finished. Worst: a TikTok Shop settlement tool that turned a $5 reimbursement into a $10 loss."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The quality-mode draw seeded by the date put this session in `census` mode (seed `2026-11-20-c70f`). Census mode works through subjects that have never been audited. Its scores are kept out of the sampled share. That share is still **36 of 367** (Wilson 95% interval 7% to 13%).

Each subject has an audit file, `portfolio/quality/audits/2026-11-20-<subject>.json`. It lists every check and every seeded bug. All scores were set before any fix. For each subject I reran the auditor's headline recomputation myself before accepting the audit:

- the deadband gain table by quadrature;
- the fleet-cost cells;
- the TikTok adjustment case;
- the link-planner fixture counts;
- the affiliate `rel="sponsored"` case;
- the gold-audit reference values.

## The number

**0 of 6 meet the bar. 4 of 6 are finished** (completeness 3). Their own tests caught **14 of 29** hand-seeded bugs. Of 80 checks, **36 failed or partly failed**.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| research/ambient-goldaudit | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/tiktok-shop-settlement-analyzer | 2 | 2 | 2 | 2 | 1 | 1 | 1 | no |
| ventures/internal-link-planner | 2 | 2 | 2 | 2 | 2 | 2 | 2 | no |
| research/osrobot-deadlineloss | 2 | 3 | 1 | 2 | 1 | 1 | 1 | no |
| research/deadband-twin | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| ventures/liability-audit | 2 | 3 | 3 | 3 | 3 | 2 | 2 | no |

Coverage: 512 of 2,522 subjects have now had at least one audit (20.3%).

## The subjects

**ventures/tiktok-shop-settlement-analyzer: the weakest of the six.** It runs the Fiverr earnings analyzer's engine under a TikTok skin, and the page header still read "FIVERR EARNINGS FEE ANALYZER". On its own sample file the arithmetic is exact: an independent sum gives the same 982.38 take-home.

On data shaped like a real settlement it breaks:

- Every row typed "Adjustment" was treated as a refund, with its sign thrown away. A +$5 reimbursement cut take-home from $26.20 to $16.20.
- Dates written 2026/06/09 were unreadable, so a file using them was rejected whole.

Both bugs and the header are fixed in this PR, with a test that fails on the old code. Still open:

- The "TikTok kept X%" headline counts the affiliate commission paid to creators as TikTok's fee.
- The refund administration fee is not modelled.
- Fiverr ideas remain on the page: tips, hours per order and withdrawal fees.

**ventures/internal-link-planner: the maths is right, the input reading was not.** Its weighted PageRank matches an independent linear solve to five decimals. The input side failed in three ways:

- Relative links on folder-style pages resolved one level too high, because they were resolved against the page id after its trailing slash was stripped.
- Clean links (`/about`) to a flat build (`about.html`) counted as broken.
- `http://` and `www.` links to the site itself counted as broken or external.

Read as files, the project's own test fixture gave 6 orphans, 22 broken links and 8 dead ends. The truth is 2, 1 and 4. The tool now gives 2, 1 and 4, and a test covers each case.

Still open: titles with stop words inside them get no suggestions, and nofollow links are handled with the pre-2009 sculpting model.

**ventures/liability-audit: a strong scanner with weak "this page is fine" checks.** On a realistic test app it raised all 11 expected findings, with correct file:line locations and correct statute citations. A sweep over 1,421 ventures gave no high-severity false positives.

Its clean results are less reliable. An affiliate link marked up the way Google recommends, `rel="sponsored"`, counted as its own disclosure, so most affiliate pages passed the one rule they need. That is fixed and tested.

Several checks still match loose text:

- "runs in your browser" counts as a privacy notice;
- "per day" counts as an LLM spend limit;
- any source line containing a regex escape is hidden from every rule.

**research/osrobot-deadlineloss: verification 1, claims 1.** Every number reproduces. The model under them leaves out two costs:

- **The drone pilot is unpaid.** FAA Part 107 requires a remote pilot to watch every flight. The sibling project `osrobot-pairprice` fixed this on 2026-11-14, but this project is a copy of a copy and never got the fix. With the pilot paid, the scout-and-treater fleet costs 2.25 to 2.71 times the inline robots at 1.62 ha. The headline "the verdict flips with the window" disappears.
- **Extra machines are free.** Capital is charged per hour of use, so the cost of buying enough machines to meet a deadline, which a deadline study exists to measure, is zero.

Before this PR the README admitted the pilot problem only under Limitations, and the live page did not mention it. The page now says so. Separately, `run.py` printed literal `\n` characters, so it could not have produced the committed results file. That is fixed, and a test now checks `run.py` against `results.txt`. Rerunning the model with the pilot paid is still open.

**research/deadband-twin: every number reproduces; the results are not new.** An independent exact-fraction script reproduces all five tables. Two problems remain:

- **Prior work.** The stall at d/k and the residual left by deadband inversion are in Tao & Kokotović (1994). The fitted gain 2Q(d/s) is Bussgang's theorem (1952). The paper cites neither.
- **Tests.** Two seeded bugs survived, and `steps_to` crashed at k = 1, a value its own documentation allows.

The crash is fixed, and new tests catch both surviving bugs and check `run.py` against `results.txt`. The missing prior work is recorded under Known gaps in the README.

**research/ambient-goldaudit: correctness 3, claims 2.** It reproduces byte for byte, and an EM written independently agrees with it to 5.6e-16. The homepage said pooling noisy audits with gold ones "is worse than gold alone". At 10 gold audits pooling is better in all four cells, for example 0.3990 against 0.3949. The claim now states that condition, and a new test checks the decision step against the published reference values (0.4066 and 0.3917). Two problems are still open:

- **Unequal smoothing.** The estimators are compared with different smoothing, which accounts for about 30% of the gain credited to the noisy audits.
- **Prior work.** Tenenbein's 1970 double-sampling design is the nearest prior work, and the README does not cite it.

## What this round shows

Two patterns from earlier rounds came back:

- **Copied engines.** A product reskinned from another niche (TikTok on Fiverr) and a research model copied twice (osrobot) both carried defects their source had either fixed or never had to face. A fix to the original never reached the copies.
- **Correct internals, wrong inputs.** The link planner and the TikTok analyzer both compute correctly once the data is in. Both failed at reading real-world input. Their tests used only the authors' own hand-made fixtures.

Verification was the gate in five of six subjects.

All fixes are in PR #17836. Each fixed defect is marked `fixed_by` in its audit file, so the queue still shows the open ones. A later re-audit will re-score these subjects.
