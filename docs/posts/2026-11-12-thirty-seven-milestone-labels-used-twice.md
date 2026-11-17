---
title: "Thirty-seven research milestone labels were used twice, and a tool that picks the next free one"
seo_title: "Duplicate milestone labels in research logs, and a fix"
date: 2026-11-12
description: "Four research logs named 37 milestones twice, so a later citation of 5h or 8e could mean either study. A new reader gives the newest entries and a free label."
tags: [process, research, tooling, research-logs]
---

Each research programme here keeps a `LOG.md`: one `## <date> · Milestone <label>: <question>` entry per step, newest first, with the prediction written before the run and the outcome after. Later entries and the papers cite those labels ("6zo's split T", "closes 6w's Next"), so a label has to name one study.

Run records kept reporting friction with these logs. Sixteen of the 35 are over 40 KB, and marine-hull's is about 370 KB, so "read the newest entries" overflowed a tool read and runs reached for `sed` ranges. Three runs reached for `tail` out of habit and got the oldest entries, since the newest are at the top. Several reported label clashes: one picked the next label only after grepping every heading, and another renamed its pre-registered 11b to 11c after a sibling session landed an 11b first.

To see how far this went, we read every labelled heading in the 35 logs (851 distinct labels). We counted a label as reused when it comes back after other labels have intervened, on dates more than two days apart. That rule leaves out a plan and its outcome sharing a label, and a milestone landed in parts such as "M2 (part)". We read all 37 hits by hand, and each one is two different studies under one label:

| Log | Labels used twice |
|---|---|
| marine-hull | 28 (3k, 4c to 4f, 5b to 5m, 6p to 6z) |
| aerolog-scaling | 7 (6b, 8b to 8g) |
| heavy-hydraulics | 1 (6b, on three entries) |
| llm-coding-inference | 1 (7a) |

In marine-hull, "Milestone 5h" is both a test of thresholds for slowing down (28 October) and a test against an archived HRRR forecast (5 November). The likely cause is a run that read the top of the log, missed that the series had already reached 5m, and started again at 5b. Nothing was fabricated and each entry stands on its own. But a later "as 5h found" is ambiguous, and so are the predictions that name a milestone.

The fix is a small, stdlib-only reader, `research/_shared/research_log.py`:

- `latest <slug> -n 3` prints the three newest entries by their heading dates, so the file's order does not matter.
- `labels <slug> --ref origin/main` prints the newest label, the next one not used in the working tree or on main (so a sibling's landed 11b counts), and every reuse.

On marine-hull it gives `next free: Milestone 6zq`. `research/PROGRAMMES.md` now points to it at the step where a run reads the log. The old entries keep their labels, because renaming them would break the references to them. The tool reports reuses but does not fail on them.
