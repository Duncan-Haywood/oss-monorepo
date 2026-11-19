---
title: "Let the run say what is finished: a --history flag for the flagship rows"
seo_title: "Let the run say what is finished: a --history flag"
date: 2026-11-19
tags: [process, tooling]
description: "Twelve runs on 19 November cut a landed result by hand to fit a 2,000-character row. The tool now moves a result the run names to HISTORY.md in the same call."
---

Each flagship product here has a `next:` row in `portfolio/flagships.yaml`. It is the list of open items the router hands to the next session, capped at 2,000 characters so it stays readable. A session that lands an item rewrites the row with `portfolio/router/flagship_field.py`, which rewraps the YAML and, when the edit would pass the cap, makes room by itself.

Making room is the hard part. Over three days the tool learned seven rules for it. It parks open items from the end of the row into the venture's `NEXT.md`. It never parks a clause that says "landed". Dated results that come before the row's open marker go to `HISTORY.md`. Undated items that read like results ("8 of 9 cells", "failed", "ships") go there too. Each rule fixed the reports it was written for.

The rows still filled up. Many rows are mostly results with no date and no "landed" in them, sitting where no rule will move them:

- ai-bookkeeper's row was at 1,997 of 2,000: "Oklahoma cards (README): MCC names 65-70%, keywords agree 93% held out".
- changepoint-detector's row was at 1,998.

Faced with a row like that, the tool parked open items, or refused outright: "parking every item it may move still leaves 2068". On 19 November that refusal was the most reported friction against the tool. Twelve run records that day (PRs #17479 to #17609) cut a landed clause by hand, copied it somewhere, and tried again. One of them asked for "a --park-landed option".

## What changed

Only the run knows which part of the row is finished. So instead of an eighth rule, the run now says so:

```
flagship_field.py changepoint-detector --replace OLD NEW \
  --history "update-rate: pegs 4 of 7 dated"
```

`--history TEXT` takes any span of the unfolded row, dated or not, and is not limited to one `; ` item. It moves that text to `ventures/<v>/HISTORY.md` in the same call as the replace, before the cap is checked. The separators around the cut are cleaned up, so "a. X; b" becomes "a. b".

When an edit still doesn't fit, the refusal now ends with ready-made flags: the row's result-like items, longest first, enough to cover the overrun. The message also says to check that each one is really done, because the classifier makes mistakes. On photo-editing it suggests an item that is still open work.

A dry run on changepoint-detector shows the difference. Before, adding 70 characters there meant parking an open item. Moving two results the run named (a failed bee-dance check and "pegs 4 of 7 dated") leaves the row at 1,934, with nothing parked and nothing open lost.

## Why a flag and not a better rule

The last four changes to this tool were classifier rules, each a little broader. Each one also moved something it shouldn't have, and the next run reported that. A flag can't misclassify. The run already knows the result it just landed, or the one it is replacing, and the tool only has to make the move cheap. The automatic rules still run first, so a session that doesn't use the flag gets the same behaviour as before.

Whether this helps should show up in the run records. The thing to watch is how many `flagship_field.py` friction reports per day say "had to cut a landed clause by hand", against the twelve on 19 November.
