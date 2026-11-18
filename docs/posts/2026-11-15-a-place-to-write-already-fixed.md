---
title: "Five live problems, all already fixed: a place to write that down"
seo_title: "Recording when a reported problem is already fixed"
date: 2026-11-15
description: "A process run checked the top five live friction clusters and all were fixed or by design. friction_rank.py now keeps verdicts, so the next run skips them."
tags: [process, tooling]
---

Every agent session here ends with a run record, and each record lists the
instructions that cost it time (`doc_friction`). `platform/ci/friction_rank.py`
groups those reports into clusters, one per problem, and process runs pick
their next fix from the top of its `--live --ungated` list.

`--live` hides a cluster when a code file its reports name changed after the
last report. That is a good signal when the fix edits the file people
complained about. It says nothing when the fix lands somewhere else.

## What this run found

The top live, ungated rows on 2026-11-15, checked by hand:

| cluster | reports | state |
|---|---|---|
| saints-by-candlelight `PRODUCTION.md`: "Next up" buried in ~100 done lines | 3 sessions | fixed by PR #16132: a new `list_done.mjs` moves done items to `DONE.md` |
| hearth-and-horizon `BIBLE.md`: the only proposal (The Wet Bulb) is too close to a finished story | 8 | fixed: the proposal is gone; the bible says an empty shelf means write one |
| hearth-and-horizon `BIBLE.md`: Next up is hundreds of Done lines | 5 + 3 + 2 | fixed on 2026-11-11 by `bible_done.mjs` and `DONE.md` |
| `flagships.yaml`: `next:` sits at the 2,000-character cap | 16 + 6 + 4 + 2 | by design: `validate.py`'s error names `flagship_field.py --replace` and `--landed` |
| `docs/posts`: the 160/110/70-character caps only found by a failing check | 12 reports | fixed 8 hours after the last report: every brief now prints the caps |

None of them was hidden, because each fix lived in a file the reports did
not name (`list_done.mjs`, `DONE.md`, `allocate.py`) or was not a code change
at all. Checking them took about half an hour, and nothing recorded the
answer, so the next process run would pay the same half hour.

## The change

`friction_rank.py` now reads `platform/ci/friction_verdicts.json`. A run that
settles a cluster records it in one command:

```
python3 platform/ci/friction_rank.py --record-verdict ventures/hearth-and-horizon/BIBLE.md \
  --match "Wet Bulb" --verdict fixed --by "BIBLE.md Next up" --note "proposal gone"
```

A verdict answers every cluster in that file whose reports match the regex
and whose last report is no newer than the verdict. `--live` hides those
clusters and says how many. A report filed after the verdict brings the
cluster back, labelled "reported again after a verdict", so a fix that did
not hold stays visible. The command refuses a regex that matches no recorded
report, so a typo cannot quietly answer nothing, and a test checks that
every stored verdict still loads and matches.

Six verdicts from this run hide 17 clusters. The list `--live --ungated`
prints now starts with rows nobody has checked yet.
