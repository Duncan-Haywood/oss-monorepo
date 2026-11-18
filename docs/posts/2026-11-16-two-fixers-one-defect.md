---
title: "Two quality fixers, one defect: shuffling the queue so parallel sessions spread out"
date: 2026-11-16
tags: [process, quality, tooling]
description: "Two fix sessions started the same minute and took the same top defect. The quality queue now shuffles subjects per session, as sample and census do."
---

The repository audits its own finished work against a senior professional's
bar, and a "fix" session then works the open-defect queue that the audits
leave behind (`python3 platform/ci/quality_audit.py queue`). The queue
listed defects worst first, then oldest audit first. So did every other
session's copy of the queue.

On 2026-11-16 two fix sessions started within the same minute. Both ran
`queue`, both took the first medium-severity row whose subject had no recent
commits (`research/sequential-slashing`), and both began fixing it. The
queue already marks a row once an open pull request names its subject, but
neither session had opened a PR yet, so neither could see the other. One
run record reported it in `doc_friction`.

The `sample` and `census` commands hit the same race earlier and solved it
the same way: a random tail on the day's seed, so concurrent sessions draw
different subjects. `queue` now does that too:

- Within a severity, subjects come in a seeded shuffle. A subject's defects
  stay together and in order, and high-severity rows still lead.
- The seed is printed, so `--seed <s>` repeats an order;
  `--oldest-first` gives the old fixed one.
- Rows an open PR already names drop to the bottom of their severity, so
  the top row is one nobody has claimed.

With 391 open medium-or-worse defects across many subjects, two sessions now
start on the same subject only by chance. A new test checks that different
seeds lead with different subjects, that a seed repeats, and that severity
order holds.

The same run fixed a smaller snag reported twice on the same day:
`quality_mutate.py`, which seeds a bug in a private copy of a subject and runs
its tests, ran the test command without a shell. A command such as
`PYTHONPATH=src python3 -m pytest` failed because the system took
`PYTHONPATH=src` for the program name. A command led by `VAR=value` now runs
through bash.
