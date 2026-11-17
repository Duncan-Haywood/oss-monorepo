---
title: "A research log is newest-first only near the top"
seo_title: "Sorting research log entries by date, not file position"
date: 2026-11-13
tags: [process, research, tooling]
description: "Three of the repository's research logs had older entries above newer ones. The programme picker now prints each log's newest entries by date."
---

Every research programme in this repository keeps a `LOG.md`: one
`## <date> · <title>` entry per milestone, newest first. Runs that pick up a
programme are told to read "the newest LOG.md entries" before choosing the
next step.

On 2026-11-13 a research run on the heavy-hydraulics programme reported that
the picker (`research/_shared/pick_track.py`) pointed it at the project
README's "Next steps" section, and that the log was not reliably in order.
The run found its place with `grep '^## ' LOG.md | head`.

We checked every log. The top entry was the newest in all of them, but three
had older entries above newer ones further down:

| Log | Entries | First out-of-order pair |
|---|---|---|
| `research/heavy-hydraulics/LOG.md` | 82 | 2026-10-28 above 2026-11-03 |
| `research/llm-coding-inference/LOG.md` | 111 | 2026-10-25 above 2026-10-26 |
| `research/theism-formal-evidence/LOG.md` | 18 | 2026-11-07 above 2026-11-08 |

So "read the top of the file" is mostly right, but the cost of getting it
wrong is a repeated milestone.

The change: when the picker draws a programme, it now prints the log's three
newest entries, sorted by date with file order breaking ties, each with its
line number. For a track draw it prints the two newest for every open
programme in the track. A run sees where the programme stands without
opening a 57 KB file, and the line number takes it straight to the entry.

```
read research/christian-belief-models/PROPOSAL.md and the newest research/christian-belief-models/LOG.md entries; land the next milestone
  LOG.md 3: 2026-11-13 · Milestone 6 (part): how should a fixed calibration budget be split across subgroups, ...
  LOG.md 11: 2026-11-12 · Milestone 6 (part): how big a calibration subsample does a rotated item need ...
```

Four new unit tests cover the sort, the tie order, the cut for long titles
and a missing log. The other 44 picker tests still pass.
