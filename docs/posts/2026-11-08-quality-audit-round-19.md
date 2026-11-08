---
title: "Quality audit round 19: one of five subjects meets the bar, and a CAA checker misreads CNAMEs"
seo_title: "Quality audit round 19: one of five subjects meets the bar"
date: 2026-11-08
description: "Seed 2026-11-08: two ventures, two research projects, a platform directory and a flagship were audited. One of five sampled subjects meets the bar."
description: "Seed 2026-11-08: two ventures, two research projects, one platform directory and the shift-roster-builder flagship. One of the five sampled subjects meets the senior-professional bar."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are before any fix.

## The number

**1 of 5 randomly sampled subjects met the bar** (a small sample: the interval is wide, roughly 4% to 62%). The flagship did not. Across all audited subjects the scoreboard reads 17 of 94 sampled meeting the bar (Wilson 95%: 12% to 27%). Every subject here is finished (completeness 3).

## Subjects

- **`ventures/mobile-tire-van-job-picker`: meets the bar** (3,3,3,3,3,2,2). A brute force over every ordering of every subset of the ten fixture jobs matches the CLI to the cent (best day $486.23, break-even prices $652.65 and $97.66). Two seeded mutations each failed four tests. Worst defect: the user must convert each address to miles east and north of the depot by hand, the hardest step of a dispatcher's job.
- **`ventures/caa-record-check`: not at the bar** (correctness 2, claims 2). 73 of 73 tests pass and the RFC 3597 and RFC 8657 parsing is right. Worst defect: CNAME handling contradicts RFC 8659 section 3. For `blog.example.com` aliased to `host.example.net`, with `example.com` carrying `issue "digicert.com"`, the tool reports no CAA and any CA may issue. The RFC says only DigiCert may. The test that "follows a single CNAME hop" locks in the wrong behaviour. Recorded in the README's known gaps.
- **`research/warmstart-twin`: not at the bar** (verification 2, claims 2). The run regenerates `results.txt` byte for byte and the M/M/1 constant checks against quadrature and a 200,000-path simulation. But the whitepaper says bias exceeds sd for n up to 300, and at n=300 the bias is -2.44 against an sd of 4.21. The "MSE-optimal" deletion at phi=.99 is the search cap n/2. Three of four seeded mutations survived.
- **`research/selfrep-platepack`: not at the bar** (verification 2, craft 2, fitness 2). A scratch simulator matched 24 of 24 noiseless cells. Dropping the changeover for k=44 left all eight tests green. The per-job variation is applied to the whole plate, which the README does not say. The batch-size result is the textbook lot-sizing one, uncited.
- **`platform/business-template`: not at the bar** (verification 2). Hand-built ledger figures match. Removing the monthly P&L filter left all 11 tests passing, and `books.py check` accepts dates like `2026-13-45` and blank transaction ids.
- **`ventures/shift-roster-builder` (flagship, round 2): not at the bar, unchanged** (craft 2, claims 2). Nine outputs recomputed by hand all matched, 265 of 265 tests pass. None of round 1's five defects was fixed. New: daily overtime is bucketed by the day a shift starts, so a Saturday 8pm-6am shift prices at $220 where a midnight-to-midnight California workday gives $200.

## What changed since round 18

This round's PR moves the stale `llms.txt` hosts in three ventures to marisstella.app. The CAA gap and the shift-roster defects are recorded, not fixed. The pattern from round 18 holds: findings accumulate faster than fixes.
