---
kind: note
topics: [guidance-system, software-for-routine]
date: 2026-11-16
---
# polish_queue.py: the open "Still weakest" items, minus the taken ones (process, 2026-11-16)

**Why.** The polish prompt says the next run starts from the last report's
"Still weakest" list. With 14 polish reports on 2026-11-16 alone, those lists
overlap and go stale: four run records from 2026-11-13 to 11-16 report the
item they meant to take already landed (one by PR #15883 the same day) or in
open PR #15905, and a fifth says picking meant reading 25 polish reports.

**What.** `python3 platform/ci/polish_queue.py` reads every
`docs/reports/polish-*.md` (by name, since a fresh clone gives every file the
same mtime), takes each report's numbered "Still weakest" items, and drops the
ones a later report's lead says it picked ("Picked item 2 of "Still weakest" in
`polish-...md`", "Picked from `polish-...md`, "Still weakest" item 3"). A
"Carried over: a; b; c" item is split into its parts, and a part that names its
source (`(`polish-...md`, item 1)`) is dropped when that source was picked. A
part repeated in an older report prints once (newest copy). An open item whose
key words match a taken one prints with `[maybe taken: ...]`: that match is a
guess, so check it.

On main today (`--days 2`): 30 reports listed 98 items, 157 once carry-overs
are split; the tool prints 60 open, hides 27 a later report took, and marks 7
as maybe taken.

**Limits.** It reads files, not pull requests: an item an open PR is working
on still shows as open, so search open PRs (`polish in:title`) too. An item
fixed in passing without a later lead naming it stays open until a report
says so. The pick phrases it understands are the ones the last 30 reports use;
a lead that says "the item carried over five polish reports" without a
report name or number is not resolved.

**Next.** `prompts/polish/prompt-0.md` ("Write about it") should point at this
tool; that file is owner-gated (CODEOWNERS), so the pointer is in its own PR.
A polish report that names its pick as `item N of `polish-...md`` keeps the
queue accurate.
