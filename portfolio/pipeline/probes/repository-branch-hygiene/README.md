# Repository branch hygiene probe

This probe tests the
[`repository-branch-hygiene`](../candidates/repository-branch-hygiene.md)
candidate's narrowest claim, and the one its own first-experiment step 1 asks
for: given a read-only snapshot of a repository's branches, tips, and linked
pull requests, a scanner can sort them into a review queue — never a delete
queue — without collapsing an unclear branch into "safe to remove."

Run it with:

```sh
python3 -m pytest -q portfolio/pipeline/probes/repository-branch-hygiene/test_scanner.py
python3 portfolio/pipeline/probes/repository-branch-hygiene/scanner.py \
  portfolio/pipeline/probes/repository-branch-hygiene/fixtures/mixed-repo.json \
  /tmp/branch-hygiene-report.json
```

## What it classifies

Six categories, matching the candidate's boundary section exactly:
`protected`, `shared` (an open PR), `moved_since_closed`, `duplicate`,
`unique_work`, and `uncertain`. **Only `duplicate` is ever proposed for
deletion** — every other category's `proposed_action` is `keep`, and every
branch outside `duplicate` gets an entry in the recovery manifest naming its
tip and its commits not reachable from the base branch. `uncertain` exists
specifically so that missing or contradictory input (e.g. ancestry that could
not be computed) never gets read as "no unique work" by default.

`fixtures/mixed-repo.json` is a synthetic snapshot covering every scenario
the candidate's first experiment names: merged, still-open, reopened (folds
into the same `shared` path as an ordinary open PR), a branch that grew
commits after its PR closed, a branch that grew commits after its PR
*merged* (the sharper case — a merge does not mean nothing shipped later),
two branches sharing an identical tip with no PR on either, a branch with
unique commits and no PR at all, and a branch whose ancestry could not be
determined. Fork-hosted PR branches are the one named scenario this probe
does not model: a contributor's fork branch has no ref in this repository's
own branch list, so a single-repository sweep never sees it — a boundary the
candidate should state rather than a gap in this scanner.

## Result on 2026-08-24 (fixtures)

13 tests pass. Every scenario lands in its predicted category; the two
motivating "moved tip" cases (`feature/grew-after-pr-closed`,
`feature/moved-after-merge`) are flagged even though one PR closed and the
other *merged* — a merge-status-only or age-only heuristic would clear both.
The identical-tip pair collapses to one `duplicate` and one kept ref (the
kept ref still carries its own unique commits into the recovery manifest,
since sharing a tip with a duplicate does not make its own work disposable).
`test_recovery_manifest_covers_every_non_duplicate_branch_with_its_commits`
asserts every commit sha named on a non-duplicate branch in the fixture is
present in the manifest — the recoverability guarantee the candidate write-up
asks for, checked rather than claimed.

## Result on 2026-08-24 (this repository, real data)

`real_repo_dedup.py` runs `find_duplicate_tips` — the one classification that
needs neither PR data nor ancestry, so it is the one this repository's own
branches could demonstrate today — against
`fixtures/this-repo-heads-2026-08-24.json`, a real `git ls-remote --heads
origin` capture (631 branches, no synthetic data):

```
duplicate-tip groups: 9
redundant refs (group size - 1, summed): 10
```

Three names share one tip (`claude/charming-hawking-5my8mo`,
`claude/ecstatic-volta-r4umhr`, `claude/nice-mendel-0fbi46`); the other eight
groups are pairs. This is the candidate's own "existing signal" section
corroborated on a second, larger sample than PR #829's sweep — and it is
also exactly the boundary this probe insists on: the scan proposes *which
ten refs are redundant with another ref already in the list*, not that any
of the other 621 branches are safe to delete. Classifying those would need PR
state and base-branch ancestry this demonstration did not collect.

## What this is not

Not PR #829's internal branch-cleanup workflow, which deletes this
repository's own head ref after a merge or a grace period. This is a
customer-facing, multi-repository inventory whose only output is a review
queue and a recovery manifest — see the candidate write-up's "Why this is
distinct" section.

## What is still unrun

This is a local scanner over one fixture set plus one real-data
duplicate-tip demonstration — not a hosted service, not the outreach to ten
GitHub-heavy teams the candidate's first experiment asks for next, and not a
scanner that computes `moved_since_closed` or `unique_work` from a real
repository's PR history (that needs the GitHub API's pull-request and
merge-base data, not just `git ls-remote`). No customer contact has
happened. No score moved in `candidates.yaml`.
