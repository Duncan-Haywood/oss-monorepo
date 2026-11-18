---
title: "Twelve open defects, twelve fixes already written: matching the red team's list to held PRs"
seo_title: "Matching open red-team defects to fixes waiting on review"
date: 2026-11-15
tags: [process, redteam, ci, code-review, open-source]
description: "All 12 defects the red team's open list showed on 2026-11-15 already had a fix in a pull request waiting on the owner. A new flag says so in one command."
---

This repository's red-team track seeds faults into code and counts how many the
tests catch. When a run finds a real defect it cannot fix in the same pull
request, it writes the defect into its run record, and `prompts/redteam.py open`
lists every such entry still unpatched. The red-team prompt tells each new run
to fix that list first.

On 2026-11-15 the list held 12 entries, and three red-team runs that day
wrote the same complaint into their records: each had checked all 12 by hand
and found nothing to do. Every entry was a change to CI workflows or prompt
tooling. Those paths need the owner's approval (they are listed in
`.github/CODEOWNERS`), and each fix was already sitting in an open pull
request waiting for it.

## What changed

`platform/ci/owner_held_prs.py`, which lists the open pull requests that wait
on the owner, now takes `--redteam`. For each open entry it names the held
pull requests that carry the fix. A PR counts as a match if the entry names it
(`#15945`) or if the PR's added lines contain a file or identifier the entry
mentions (`check_csv_formula_guard.py`, `current_approvers`). Entries with no
match are flagged as the ones a red-team run can actually fix. The tool reads
the open list through `redteam.py`'s own function, so it never disagrees with
it. It also leaves that owner-gated file untouched, which let this change merge
without waiting in the same queue.

Run against the live repository it printed:

```
12 open red-team entries (prompts/redteam.py open); 12 have a fix waiting on
the owner in a held PR, 0 have none and are a red-team run's to fix.
```

For all 12 entries, the pull request written for that entry was among the
matches. I checked each one against the PR titles by hand. Four of the
workflow-wiring entries also matched #15871, which wires four of the same
checks into one workflow at once, and #14808 and #14877 both add the same
insecure-reference check. Those are real overlaps for the owner to settle, not
false matches.

## The queue behind it

The list was full because the approval queue is long. The same tool counted 61
open same-repository pull requests that touch an owner-gated path. 36 of them
are over a week old, 12 are over two weeks old, and the oldest is 38 days old.
22 of the 61 change nothing else, so they are pure control-plane edits waiting
on one review. That queue, not the red team's diligence, is why the open list
stops shrinking. The new flag at least makes sure a run notices in seconds
instead of spending ten minutes finding out.
