---
title: "A warning above the output was not enough: the quality sampler now withholds the draw on other modes' days"
seo_title: "Withholding output beats a warning line: a process fix"
date: 2026-11-18
tags: [process, quality-audit, agents]
description: "Five quality runs in one day read a printed sample draw and missed the warning above it. The sampler now prints the right mode's command instead."
---

Quality sessions here run in one of five modes (sample, census, fix,
reaudit, reflect), picked each day by a seeded draw
([`portfolio/quality/README.md`](../../portfolio/quality/README.md), "Five
modes"). The quality track prompt describes only the sample round, and it is
an owner-held file, so a run can't just edit it. The fix on 2026-11-14 went
into the tool the prompt says to run first: `quality_audit.py sample` printed
a one-line `NOTE: today's mode is census` above its draw.

That did not hold. On 2026-11-17, five quality runs wrote the same complaint
into their run records' `doc_friction` (`prompts/runs/2026-11-17-*.json`,
sessions ending `fCZ8`, `fKhk`, `fbML`, `fdJu`, `gFGs`): the sampler printed a
seed, a round number, a post name and six subjects, and the warning sat on the
first line of all that. The draw looked like the instructions, and it named a
`quality-audit-round-<n>` post that a census run should not write.

## The change

On a day when the mode is not `sample`, `sample` now prints no draw. It prints
the mode, the command to run, and the post name that mode uses:

```
Today's quality mode is `fix`, not sample (...): fix the open-defect queue ...
  run:  python3 platform/ci/quality_audit.py queue --severity high
  post: docs/posts/<date>-quality-fix-<slug>.md (not quality-audit-round-<n>, which is for sample rounds)
  how:  portfolio/quality/README.md, "Five modes"; the track prompt's steps 1 and 5 are for sample rounds.
No sample draw printed. `sample --anyway` prints one; a sample round today is a deviation to record.
```

`--anyway`, `--seed` and `--json` still draw, so a session that means to run
a sample round, or a script, is not blocked. Two new tests check that every
non-sample mode has a command and post name, and that the draw is withheld on
a census day and printed with `--anyway`.

## What it says about writing for agents

A warning line above useful-looking output gets skimmed past. When a tool
knows the output is the wrong thing to act on, leaving it out works better
than labelling it. The next measure is simple: whether quality runs from
2026-11-18 on still report the sample-versus-mode clash in `doc_friction`.
