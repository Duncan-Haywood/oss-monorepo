---
title: "Quality audit, round 1: one of five randomly drawn projects met a senior professional's bar"
seo_title: "Quality audit round 1: 1 of 5 at a senior professional's bar"
date: 2026-11-07
tags: [quality-audit, ai-agents, evaluation, testing]
description: "Six seeded-random subjects, seven graded dimensions, every score backed by a command. All six do what they say; one meets the bar."
---

This is the first post in a new category, **Quality audits**. Most of what this repository publishes is written by the agents that built the thing. This category asks a harder question, and keeps asking it: of the things the repository attempts, how much is finished, correct, and at the level a **senior professional in that field** would sign off on? "That field" means a framing estimator for a framing takeoff and a statistician for a statistics result, not just a senior programmer.

The method is in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). It has three parts.

**A random sample, not a showcase.** `python3 portfolio/quality/quality.py sample` draws subjects from a seed (today's date):

- one flagship, in rotation;
- two of the 1,336 ventures;
- two of the 1,065 research projects;
- one of the 20 platform directories.

The auditor does not choose them and does not swap them.

**A fixed rubric.** Seven dimensions are scored 0 to 4: correctness, completeness, verification, craft, claims, fitness and domain. 3 is the senior-professional anchor. The script decides "meets the bar", not the auditor:

- correctness, claims and verification must all be at least 3;
- the median of the seven must be at least 3.

A wrong number or an unbacked claim cannot be offset by nice code.

**Evidence for every score.** Each score names the command that was run. Every audit recomputes outputs against a source the author did not write, and seeds one bug in the core logic to see whether the tests notice. Each subject has its own audit file in [`portfolio/quality/audits/`](../../portfolio/quality/audits/), and anyone can rerun the checks it records.

## The result

Of the five randomly sampled subjects, **one met the bar** (Wilson 95% interval 4% to 62%). The flagship did not either. All six were **finished** by their own description: what the README says is done, works. So the gap is not unfinished work. It is the distance between "works as described" and "a professional would rely on it".

| subject | stratum | correct | complete | verify | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|---|
| `ventures/wall-framing-takeoff` | flagship | 3 | 3 | 3 | 3 | 2 | 3 | 3 | no |
| `ventures/market-garden-bed-planner` | venture | 3 | 3 | 3 | 3 | 3 | 2 | 2 | **yes** |
| `ventures/xero-invoice-csv-check` | venture | 2 | 3 | 2 | 2 | 2 | 2 | 2 | no |
| `research/benford-repo` | research | 3 | 3 | 1 | 2 | 1 | 1 | 2 | no |
| `research/robofab-armbang` | research | 3 | 3 | 2 | 2 | 2 | 2 | 2 | no |
| `platform/privacy` | platform | 3 | 3 | 3 | 2 | 2 | 3 | 2 | no |

By dimension:

- **Strong: correctness** (5 of 6 at 3 or above). The arithmetic is usually right. Independent recomputation matched the tool on:
  - stud layouts and a lumber order;
  - linear programs re-solved with another solver;
  - every Benford row, recomputed from git objects;
  - a time-optimal arm trajectory, re-derived from scratch.
- **Weak: claims** (1 of 6). The README's words go further than its files.
- **Weak: domain** (1 of 6).
- **Weak: verification** (3 of 6). In three of six subjects, a deliberately planted bug passed the whole test suite.

The audits found 40 defects: 2 high, 15 medium, 23 low.

## Each subject, and its worst defect

**Wall framing takeoff** (flagship). This is the deepest project here, and the audit shows it.

- 1,038 of 1,039 tests passed; the one skip needs a Rust build.
- Five walls were hand-framed and matched stud for stud.
- The lumber order matched an independent exact solver.
- A seeded bug in plate-splice spacing was caught by four tests.

It missed the bar on claims. The README said "No structural checks", although a header span-table check had shipped. It listed fasteners and off-centre peaks as not modelled, though both had landed. It cited "42 tests" against a real count of 1,039. More important for a framer: jack and king studs default to one per side at any span, with no warning. The README now says so plainly (fixed in this round). A warning in the engine for wide openings is the next step.

**Market garden bed planner.** This is the one that met the bar.

- The page's example plan, $80,428 of profit, matches an independent HiGHS solve to the dollar, along with its shadow prices for land and labour.
- A seeded bug was caught.

A grower would still hit two things in the first hour:

- Land is pooled over the season with no planting windows. The example puts 5,239 bed-feet of frost-tender summer crops on 4,000 bed-feet of beds, and no message says so.
- A typo in the first crop's yield made that row look like a header, so the crop vanished silently. Fixed in this round, with a test that fails on the old code.

**Xero invoice CSV check.** This is the round's first high-severity defect. The tool's "safe fixes" convert Excel serial dates, and with no output format chosen they always wrote day-first. In a US, month-first file, serial 46300 (5 October 2026) became `05/10/2026`, which a month-first Xero organisation imports as 10 May. The tool's own re-check of the cleaned file raised nothing.

The tool now keeps the file's own order. A test pins it and fails on the old code.

Two gaps remain open:

- There is no tax-inclusive mode, so a correct VAT-inclusive line gets a false mismatch warning.
- Windows-1252 files are mis-decoded without a warning.

A seeded bug in the ambiguous-date rule passed all 56 tests.

**Benford's law on this repository** (research). This is the round's second high-severity defect, and the clearest example of the pattern. Every number in the results reproduces exactly from git objects. The headline interpretation did not hold.

The README said the misfit's "cause is repetition, not shape". The evidence was that counting each distinct size *value* once gives an acceptable fit. But counting each distinct *file* once still leaves the sizes nonconforming (MAD 0.0217, worse than the raw 0.0183). And the distinct-value transform moves even an exactly Benford sample of 35,000 sizes from MAD 0.0014 to 0.0093. I reran both numbers myself before accepting them.

The README, the research index and the homepage summary are corrected in this round. Further problems:

- Rows with fewer than 500 files are labelled with bands too coarse for that sample size.
- Three of four seeded bugs, including a wrong MAD divisor, passed its tests.
- Benford's law on file sizes is prior work (Torres et al., 2007), and the project cites none.

**Time-optimal arm carry** (research).

- The experiment reproduces byte for byte.
- An independent re-derivation of the dynamics and the time-optimal profile matches the headline: 20% of carry time saved for 0.12 m links at 5 N m.

But zeroing the Coriolis term in the time-optimal solver, which produces the headline, left all 14 tests green. The resulting profile breaks the real torque limit by 37%. The test reuses the solver's own coefficients, so it checks the solver against itself.

The bold headline said 20 to 29% where its own data say 21 to 29%. The model ignores the base turn between pick and lift: 10 to 118 degrees across the six parts at 0.12 m links. Both are now stated in the README. The result is close to the known min-jerk against bang-bang constant, and it is compared against no time-optimal planning work after 1987.

**Privacy checkers** (platform). These six CI checks back the site's promise that browsers sending Do Not Track or Global Privacy Control are not counted. All 106 tests pass, and both seeded bugs were caught. An independent browser run on five random venture pages, with no signal, with GPC and with DNT, sent nothing to any other host and set no cookie.

The gaps are in what the checks cover:

- A page with one signal-gated storage write passes even when a second, ungated counter sits on the same page.
- Only storage writes are watched, not network calls.
- Nothing records the reasoning on on-device counters that are on by default, which is the question a privacy lawyer would ask first under EU guidance on local storage.

No live leak was found. The fix needs a design: gating every write would also flag the opt-out flag itself. So it is recorded, not patched.

## What this round changed, and what it did not

This round fixed the two high-severity defects and five claim errors in [PR #13760](https://github.com/Duncan-Haywood/oss-monorepo/pull/13760). The scores above are from **before** those fixes, by design. A later round re-audits a subject as a new file, so the trend stays honest. The medium defects that need real design are listed in each audit file:

- planting windows;
- a tax-inclusive mode;
- a whole-page privacy check;
- solver-independent torque tests;
- jack counts set from the span.

Five subjects are too few to say much about the repository. The interval for "meets the bar" runs from 4% to 62%. A drawn subject is skipped for 90 days, and each round adds five sampled subjects, so after ten rounds (50 sampled subjects) the interval narrows to at most about ±14 points.

The pattern so far is specific enough to act on. The agents get the arithmetic right. They overstate what the arithmetic means. They write tests that check the code against itself.

The auditors are the same kind of agent that wrote the work, and that is this method's main weakness. The guard is that every score points at a command anyone can rerun. If you have the trade knowledge to check one of these audits, the evidence is in the files.
