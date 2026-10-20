# How long do research pull requests stay open, and how often do they really collide?

Pure Python standard library plus `git` 2.38 or later. A follow-up to `swe-sharedfiles` and `swe-cleanbroken`, whose next steps both asked for real pull-request lifetimes to replace the assumed 5 to 240 minute windows. Part of milestone 5 of track 10 (the software-engineering loop). Produced with AI assistance (Claude). **Preliminary: about 1.5 days, one repository, and "lifetime" is pull-request lifetime, not branch lifetime.** All numbers are from `experiments/results.txt`.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/swe-prlifetime/

- **Pull requests are open for minutes, not hours.** Of 122 merged pull requests that touched `research/` (merged 2026-10-16 11:20 UTC to 2026-10-17 14:07 UTC), the median time from creation to merge was 0.9 min (p75 3.7, p90 16.0, max 206). 80% merged within 5 min of being opened and 95% within 30.
- **So the assumed windows were far too long.** `swe-sharedfiles` asked "what if a PR stays open 30 or 60 min?" For this repository only 5% and 2% of PRs did.
- **Real exposure is small.** 58 of the 122 edit a shared index file (`research/README.md` or `research/_homepage/projects.json`). While those 58 were open, an average of 0.40 other shared-file merges landed, and 12 of 58 (21%) saw at least one.
- **Replayed from their real creation time, 2 of 58 (3.4%, 95% Wilson interval 1.0% to 11.7%) conflict textually**, both in a shared file. Both are among the 12 that saw a landing (2/12 = 16.7%, in line with `swe-sharedfiles`'s one-in-six per landing); none of the 46 that saw no landing conflicted. Each pull request is one trial here, so unlike the pair rates in the earlier projects these are not overlapping samples.
- **Read together:** the shared-file collision cost is real but about an order of magnitude lower than the 30-minute assumption suggested, because pull requests are opened at the end of the work and merged at once. It does not on its own justify a generated index.

## Reproduce
```bash
git fetch --unshallow origin main    # full history is needed
cd research/swe-prlifetime
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, about a second
python3 experiments/run.py > experiments/results.txt       # about 30 seconds
```
`data/prs.csv` holds `number, created_at, merged_at, head_repo` for the 500 most recently updated closed pull requests (GitHub API list-pull-requests, `state=closed`, sorted by `updated` descending, five pages of 100, fetched 2026-10-17). A pull request merged after the oldest `updated_at` in that set must be in it, so coverage starts at 2026-10-16T11:20:31Z (`COVER_FROM` in `run.py`); every research merge in that period joined to a row (122 of 122). Only timestamps and numbers are stored, no titles, bodies or user names.

## Motivation
Both earlier projects said their windows were assumed: squash merges hide when a branch was cut, so they could not say how long pull requests stay open. The API does record it. This measures it and redoes the replay with each pull request's own start.

## Builds on
`swe-sharedfiles` (the exposure and replay method, reused) and `swe-cleanbroken` (clean merges were not broken in the sample); `swe-schedule` for the framing. No lab's work is built on, and no lab is affiliated with or endorses this project.

## Method
`src/swe_prlifetime/analyse.py`. `git log --first-parent` on `origin/main` lists each merged pull request touching `research/` with its time and files; the number comes from the `(#N)` suffix or "Merge pull request #N" subject. It is joined to `data/prs.csv` for the real creation time (same-repository heads only). Lifetime is `merged_at - created_at`. For each pull request that touches a shared file, the replay takes `main` as of the creation time, applies the merge commit's own diff onto it (the branch as it would have been had it never merged `main` in), and three-way merges that with `main` just before the real merge, with `git merge-tree`. Conflict paths are read from git's output. "Landings" counts other shared-file merges between creation and merge. Tests cover the arithmetic, the half-open window, the join, and the replay on a throwaway repository with one clean and one conflicting case.

## Limitations
- **Pull-request lifetime is not branch lifetime.** Sessions typically open the pull request when the work is pushed and merge it soon after, so the work itself, done on a branch cut earlier, is invisible here. A branch that is cut early and not updated is exposed for longer than the PR figure shows; agents are told to merge `main` in before merging, which this replay deliberately does not do.
- One repository, about 1.5 days, 122 pull requests, 58 touching shared files, 12 with a landing. The 95% interval on the conflict rate is wide (1.0% to 11.7%), and the 2/12 figure much wider.
- Textual conflicts only; `swe-cleanbroken` covers clean-but-wrong merges for an earlier window, and nothing here runs `build.py` on the replays.
- The data covers merged pull requests; closed-unmerged ones are not analysed. Times are GitHub's, in UTC; commit times are the committer's clock.

## Next steps
Measure the time from first commit on a branch to merge (the API's commits endpoint, one call per pull request) to get branch lifetime; widen the window as more history accrues; and run `build.py` on each clean replay.

## Owner steps
None.

## Outside dependencies
`git` 2.38 or later (for `merge-tree --write-tree`); this repository's history; GitHub's API for the timestamps in `data/prs.csv`, fetched once and committed.
