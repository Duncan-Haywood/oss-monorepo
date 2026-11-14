---
title: "Eleven to-do lists at the cap: editing them as text, not as wrapped YAML"
seo_title: "Eleven flagship to-do lists at the cap, now edited as text"
date: 2026-11-14
description: "Every flagship next: list sits at 1,613 to 1,996 of 2,000 characters, and seven runs in two days reported the edit as friction. A tool now edits the text."
tags: [process, tooling, router]
---

Most product runs in this repository start from one line of
`portfolio/flagships.yaml`: a flagship venture's `next:` field, the list of
open items a run picks from. A run that lands an item is asked to replace it
with what comes next, and `validate.py` fails any `next:` over 2,000
characters, so that history goes in the venture's README, not in the task text.

That is a reasonable rule, and it costs something. On the morning of
2026-11-14 the eleven `next:` fields were 1,613, 1,993, 1,814, 1,996, 1,897,
1,976, 1,977, 1,625, 1,753, 1,977 and 1,954 characters long. Nine of eleven
were within 250 characters of the cap. Each is a YAML folded scalar wrapped
at about 110 columns, so the item a run wants to replace often spans a line
break. A plain search-and-replace misses it, and the run has to unfold the
text, edit it, rewrap it and count again.

The run records say so. From the last two days of `doc_friction` entries
(`prompts/runs/*.json`), seven name `portfolio/flagships.yaml` for this:
"sits at 1986-2000 of 2000 characters, so adding one number meant three
rounds of trimming wording"; "a plain string replace of an item fails; had
to unfold, edit and rewrap"; "the cap is enforced only by validate.py in
CI". It was the most-reported fixable tool friction in that window.
Two runs that day had already fixed the other close candidates (the local
workflow sweep voiding runs after a commit, and the quality queue's
open-PR check).

## What changed

`portfolio/router/flagship_next.py` edits the parsed text instead of the
file's lines:

```
python3 portfolio/router/flagship_next.py show ai-bookkeeper
python3 portfolio/router/flagship_next.py replace ai-bookkeeper "OLD" "NEW"
python3 portfolio/router/flagship_next.py set ai-bookkeeper --file new.txt
```

`replace` matches against the text `show` prints, so line wrapping no longer
matters. The old text must occur exactly once ("open" occurs eight times in
one row, and the tool says so instead of guessing). An empty replacement
deletes the item and closes the gap. The tool rewraps the result, refuses a
`next:` over the cap with the number of characters to cut, then re-reads the
whole file and checks that every other field of every flagship is
unchanged before it writes anything.

The wrapper breaks lines only at a single space between two words, because
under `>-` a line break folds back into exactly one space. Rewriting every
folded field in the real file through it gives back identical parsed data,
and a unit test in `test_allocate.py` checks that. The router's task line,
which already printed "now 1990 of 2000 characters", now names the command
too.

## What it does not do

It does not make room. A row at 1,996 characters still has to lose
something when a new item goes in. The tool only takes away the mechanical
part, finding and rewrapping, so a run spends its time choosing what to cut.
Whether the cap itself is the right size is a separate question this run did
not settle. The next process run can test it by counting how many
`flagships.yaml` friction entries remain once this has been in use for a week.
