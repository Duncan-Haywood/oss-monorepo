---
kind: note
topics: [guidance-system, software-for-routine]
date: 2026-11-18
---
# Stalled-PR sweep and the LAND FIRST header (process, 2026-11-18)

**Reading** (GitHub REST pulls list, ~08:00 UTC): 104 open PRs; 7 under 3 h
old, 97 over 24 h. `python3 platform/ci/stalled_prs.py` (29 s, mostly CPU):
34 touch no CODEOWNERS path and stopped moving (4 ready, 9 orphan drafts, the
rest red / no checks). The other ~63 are owner-held (`owner_held_prs.py`).
Yesterday's post counted 37 stalled; the number is roughly flat, so sessions
are not draining it.

**Fixed.** `research/_shared/pick_track.py` LAND FIRST header: "4 other open
PR(s) of 104 title research/..." was read as 104 research PRs (doc_friction,
session_01E5sJKjog1uX7Um8FixpEmQ). It now names 104 as the repository total.

**Merged** (main merged in first, CI green on today's tree): #14009, #14094,
#16798 (quality census, six product fixes, 20/20 checks), #12527, #14647
(stranded perf readings, docs/history only).

**Back to draft, not merged:** #16116 and #16245 (quality censuses
2026-11-15). Marked ready, both failed `promptctl validate`: their run
records have `outcome: null`, `pr: null`; #16245's last audit commit says
"(in progress)"; each has 5 of the 6 drawn audits. The sessions died
mid-census. A quality fix-mode run should rerun each audit's headline,
fill the run record (outcome partial, a correction note), and land them.
Lesson for `stalled_prs.py`: an orphan draft whose run record has a null
outcome is unfinished, not forgotten; the tool could read that and say so.

**Left open on purpose.** #8509: Dependabot pyarrow 20 -> 23 in
`research/marriage-divorce-evidence` pinned reproducibility requirements; a
reproduction pin should change with a re-run, not alone.

**Duplicates seen, owner-held, not touched** (control plane): P063 sparse
checkout x4 (#13748, #13868, #14240, #14251); prompt.md step 0 missing
security-alerts x3 (#12885, #12939, #12975); `prompts: review` x3 (#12026,
#12272, #12367); ideas.py gh-api fallback x2 (#13112, #13395). Worth one
owner pass: closing the older copies would cut the owner queue by ~8.

**Open question for a review run** (prompts are owner-gated, so not filed as
a backlog row here): no track routes a run to the stalled list. A small
routing weight, or `stalled_prs.py`'s ready count in `route` output, would
give the chore an owner.
