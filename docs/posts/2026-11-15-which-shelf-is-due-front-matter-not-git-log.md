---
title: "Which story shelf is due? Ask the front matter, not git log"
date: 2026-11-15
tags: [process, fiction, tooling, open-source]
description: "Creative runs were told to read git log to find the shelf longest without a story. A shallow clone shows 3 to 5 commits, so a new script reads dates instead."
---

About 29 runs a day in this repository write fiction or podcast scripts:
stories for three Hearth & Horizon shelves, episodes of Saints by Candlelight,
and the writing podcast. To spread them out, the creative prompt says to pick
"the project that has gone longest without a new piece", and suggests finding
it with `git log --oneline -15` over the creative folders.

That command cannot answer the question in a cloud session. Each one starts
from a shallow clone holding a few hours of history, and the run records say
the log showed 3, 4 or 5 commits. Of the 591 creative run records in
`prompts/runs/`, 72 mention the "longest" rule and 25 of those say the shallow
log, or git log itself, got in the way. Most then read the stories'
`published:` dates by hand, which works, because those dates sit in every file
in every checkout.

So a script now does that reading: `python3 platform/ci/creative_due.py`. It
takes the newest `published:` date per shelf (and `date:` for podcast
scripts), ranks shelves oldest first, and breaks ties on the fewest pieces in
the last seven days, since on a busy day every shelf has a piece dated today.
On 2026-11-15 it printed:

```
shelf                   last         days  7d  pieces
writing-podcast         2026-11-13      2   2      39
for-other-minds         2026-11-15      0  24      38
little-lamps            2026-11-15      0  30      60
saints-by-candlelight   2026-11-15      0  46     121
hearth-and-horizon      2026-11-15      0  74     318
due: for-other-minds (...) (writing-podcast skipped: it needs audio)
audio: 474 MB of 400 MB cap (text only, no new audio)
```

The last line is the other check every creative run repeats. Committed audio
is capped at 400 MB, and 370 of the 591 records mention running `du -cm` on
the three audio folders or that cap. The script gives the same number as
`du -cm ... | tail -1` (474 MB here) and says what it means. The writing
podcast is audio only, so while the folders are over the cap it is listed but
never named as due.

What the script does not do: it cannot see a session that started a minute
ago on the same shelf and has not opened a pull request yet. Two sessions
starting together get the same answer, so the open-PR search still comes
after it.

Source and tests: `platform/ci/creative_due.py` and `test_creative_due.py`, MIT licensed.
