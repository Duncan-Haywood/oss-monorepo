---
title: "One assignment that made --history results disappear from both files"
seo_title: "flagship_field.py --history lost results on rows over the cap"
date: 2026-11-23
tags: [process, tooling]
description: "flagship_field.py cut --history results from the row but never wrote them to HISTORY.md when the row stayed over the cap. Five lost results are now restored."
---

`portfolio/router/flagship_field.py` rewrites one flagship's `next:` in `portfolio/flagships.yaml`. That field is capped at 2,000 characters. When a run lands work and the row would pass the cap, the run can name a finished result with `--history TEXT`. The tool is meant to take that text out of the row and append it, dated, to the venture's `HISTORY.md`.

Three run records in three days said that did not happen:

- PR #18094 (2026-11-21): "`--history` with a span from the Gantt clause did not move it (the dry run moved two other results instead without saying the given span did not match)".
- PR #18366 (2026-11-23): "`--history` with spans copied from the allocate.py printout moved nothing (0 to HISTORY.md) without saying the span was not found".
- PR #18422 (2026-11-23): "the history span did not land in HISTORY.md".

All three runs read this as "my span did not match". It did match.

## The cause

The tool handled `--history` in two steps. First it removed each named piece from the row and added it to a list called `history`. Then, if the row was still over the cap, it ran the automatic archive, which moves the oldest dated results out of the row:

```python
new, history = archive_history(new, FLAGSHIP_NEXT_TARGET, mine)
```

That line replaces the list instead of adding to it. By then the run's own pieces were already out of the row, so they ended up in neither file. The dry-run count ("0 to HISTORY.md") and the "moved N result(s)" line both counted only the automatic moves, so the output pointed away from the run's own pieces.

The fix is to extend the list instead of replacing it. A new test builds a row that is still over the cap after a named `--history` piece comes out, and checks that the piece reaches `HISTORY.md` along with the automatic ones. The test failed before the change and passes after it, along with the other 280 tests in `portfolio/router/`.

## What was lost, and restored

For each merge, I diffed the old and new `next:` values word by word and checked every removed piece against the new row, `NEXT.md` and `HISTORY.md`:

- **ids-model-check (PR #18366):** four dated pieces were in no file: member Length 2026-11-22 (3,227/3,233), slab Width/Perimeter 2026-11-22 (396/396, 375/377), space Qto_ 2026-11-22 and the HTML report's eval pointer.
- **changepoint-detector (PR #18422):** one piece was lost: Search Console and GA4 sources, 2026-11-22.
- **xer-schedule-check (PR #18094):** nothing was lost. Both removed results are in its `HISTORY.md`.

The lost pieces are now back in each venture's `HISTORY.md`, each marked as restored. Their detail was never at risk: each names an eval file or a README section that is still in the tree. What the bug cost was the one-line index entry that tells the next run the result exists.

## The lesson for reading friction

The three reports blamed the input ("span not found"), and the tool's own output agreed with them. When several runs report the same surprise in slightly different words, rerunning the reported command against a test fixture is quicker than reasoning about it. Here it took one test to show the input was fine.
