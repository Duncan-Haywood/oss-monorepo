# Probe: repository branch hygiene and recovery

Executable step 1–2 of
[`repository-branch-hygiene`](../../candidates/repository-branch-hygiene.md)'s
first experiment: *"build a local, read-only scanner over synthetic
repositories covering merged, closed, reopened, moved-tip, shared-ref, fork,
and protected-branch cases"*, then *"produce a human-readable report and
recovery manifest, and verify that every unique commit remains recoverable."*

Step 3 (ten practitioner conversations, one paid pilot) is customer contact
and is **unrun** — it is the step that actually decides the candidate, and
nothing here substitutes for it.

```sh
python3 -m pytest -q portfolio/pipeline/probes/repository-branch-hygiene/tests

# synthetic fixture repo, all seven scenarios:
python3 portfolio/pipeline/probes/repository-branch-hygiene/cli.py --demo /tmp/bh

# any local repository, read-only:
python3 portfolio/pipeline/probes/repository-branch-hygiene/cli.py \
  --repo . --protected main /tmp/bh-real
```

## What it classifies

Every branch **name** (not every ref — see the defect below) lands in exactly
one category:

| Category | Meaning | Report says |
|---|---|---|
| `protected` | name is on the protected list | never eligible |
| `shared` | tip is identical to a branch under a *different* name | review |
| `duplicate` | every commit is already an ancestor of another ref, protected branches checked first | review |
| `moved` | live tip differs from a recorded snapshot tip | needs-review |
| `unique` | carries commits no other ref carries | keep |
| `uncertain` | a classification input was missing or unresolvable | needs-review |

**No category says "delete."** `test_no_action_says_delete` pins that. The
deliverable is a review queue and a recovery manifest listing each unique
commit by SHA, which is the boundary the candidate write-up sets.

## Results, 2026-08-24

**Synthetic fixture (9 refs, 7 scenarios): 9 of 9 match the oracle.** The
fixture builds its own ground truth in `fixture_repo.py`, so the tests assert
against expected categories rather than against the scanner's own output.

**Recoverability, the first experiment's stated check:** for every `unique`
and `moved` ref, each commit the manifest lists as exclusive is confirmed
unreachable from all other refs (`test_unique_and_moved_commits_are_actually_exclusive_to_their_ref`),
and every `duplicate`/`shared` ref is confirmed to lose zero commits when
deleted alone. That last check is per-ref on a restored repository, which
matters — see the race below.

**Real repository:** run against this monorepo (1 branch + origin), which is
a thin corpus and not evidence about a customer's repository. It is the run
that found the false-positive defect below, so it earned its place.

## Three defects the tests found, all kept as regression tests

1. **`duplicate_of` named an arbitrary ref.** `merged-feature` is an ancestor
   of both `main` and an unrelated topic branch; the scanner reported
   whichever it hit first. "Already merged to `main`" is actionable, "also an
   ancestor of some topic branch" is not, so protected branches are now
   checked first.

2. **Every tracked branch was `shared` with itself.** The first real-repository
   run classified `X` and `origin/X` as two refs at the same tip. On a
   repository with hundreds of tracked branches that buries every genuine
   finding. Refs are now grouped by name; agreeing copies go in `also_at`, and
   copies at a *different* tip go in `diverged_copies` — which is itself a
   finding (unpushed or force-pushed work), not noise to drop.

3. **Found by review, not by the test suite: grouping by name (fix 2) then
   compared only each name's *primary* tip.** A diverged remote copy
   (`diverged_copies`) is still a live ref. If it happened to sit at the
   exact SHA of a *different* branch's primary tip, neither branch was
   flagged `shared`, and the commit could be reported as exclusively
   "unique" to one of them while a live ref under another name reached it
   too — a direct violation of the recoverability claim. Shared/duplicate
   detection and the unique-commit exclusion set now check every copy
   (primary and diverged) of every other name, not just primaries.
   `test_branch_at_another_name_diverged_tip_is_shared`,
   `test_unique_commits_exclude_diverged_tips`, and
   `test_ancestor_of_diverged_tip_is_duplicate` pin it.

## The race, pinned as a test rather than a warning

Two refs at the same tip are each individually safe to delete and are **not**
jointly safe. `test_acting_on_a_whole_shared_group_does_lose_work` asserts
that deleting a whole `shared` group destroys the commit, which is why the
report classifies `shared` as *review* and states in every manifest that a
live ref can move between the scan and the action. A tool that emitted
per-ref verdicts and let an operator approve them as a batch would lose work
while every individual verdict was true.

## Limits

- `moved` requires `recorded_tips` — a branch's tip as recorded at some past
  snapshot (e.g. when its PR was last seen closed). No such data exists for a
  bare `--repo` scan, so **`moved` is never reported outside the fixture**.
  PR #829's sweep found 107 moved tips in this repository, which is the
  evidence that the category matters; wiring the scanner to a real PR-close
  snapshot source is unbuilt.
- Read-only by construction: no fetch, no push, no ref writes. The tests do
  delete refs, but only inside their own throwaway fixture repositories.
- Synthetic fixtures are written to exercise the six coded rules. A clean
  classification is not evidence about a repository whose history was shaped
  by anything the fixture does not model.
- No demand evidence. Distribution is this candidate's floor (scored 4) and
  nothing here moves it.
