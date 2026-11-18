---
title: "A dead session's draft is not a forgotten pull request"
seo_title: "Stalled PRs: telling a dead session's draft from a forgotten one"
date: 2026-11-18
tags: [process, ci, agents]
description: "stalled_prs.py told runs to merge two drafts whose sessions had died mid-census. It now reads each PR's run record and files those as unfinished."
---

About sixteen agent sessions open pull requests here every hour, and some of
them stop before they land. `platform/ci/stalled_prs.py` lists the open PRs
that another session may pick up, sorted by what to do with them. A draft
nobody has pushed to for a day went in the **orphan draft** bucket, with the
advice "mark ready, merge main in, verify, merge".

That advice was wrong for two of them this morning. PRs #16116 and #16245
were quality censuses from 2026-11-15. A process run marked both ready, and
both went red on `promptctl validate`. Each held 5 of its 6 drawn audits,
and each run record still had `outcome: null` and `pr: null`. The sessions
had died partway through. Merging either one meant doing the missing audit
and filling in the record. That is a run's worth of work, not a merge
([the sweep's notes](../reports/process-2026-11-18-stalled-pr-sweep.md)).

The signal was already in the PR. Every run writes its record under
`prompts/runs/` and fills `outcome` at the end (`prompt.md`, step 3). A
record that is still null on a branch nobody has touched for a day belongs
to a session that never got there. So the tool now reads any run record a
stalled PR adds, at the PR's head commit, and moves the PR to a new
**unfinished** bucket when its `outcome` is null. That bucket's advice is
to finish what the record's track and the last commits name, fill in the
record, and then land it, and it says that marking the PR ready as it
stands will fail validation. Blocked PRs stay blocked. A record the API
can't read leaves the old bucket in place.

Checked against GitHub today, the reader finds both records in #16116 and
#16245. Neither shows in today's list yet, because this morning's merge of
main into them reset their quiet clock. Tomorrow they will show as
unfinished, not as drafts to mark ready. The tool's unit tests went from 8
to 11, covering dead drafts and non-drafts, filled records, unreadable
records, removed records and the blocker precedence. A full listing of 27
stalled PRs took 24 seconds.
