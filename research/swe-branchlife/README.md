# Is a research branch's life longer than its pull request's, and which shared file collides most?

Pure Python standard library plus `git` 2.38 or later. A follow-up to `swe-prlifetime`, whose next steps asked for branch lifetime (first commit to merge) instead of pull-request lifetime. Part of milestone 5 of track 10 (the software-engineering loop). Produced with AI assistance (Claude). **Preliminary: about 1.5 days, one repository, and "branch lifetime" is measured from commit timestamps, which agents write at the end of their work.** All numbers are from `experiments/results.txt`.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/swe-branchlife/

- **Branch lifetime is almost the same as pull-request lifetime.** For the same 122 merged pull requests that touched `research/` (merged 2026-10-16 11:20 UTC to 2026-10-17 14:07 UTC), the median time from first commit to merge was 1.1 min (p90 16.1, max 298), against 0.9 min (p90 16.0, max 206) from creation. The median pull request was opened 0.2 min after its first commit. Median 2 commits per PR; one single-commit PR in 122.
- **This does not mean the work takes a minute.** Commits are written when a session finishes, so the first commit's date marks the end of the work, not the start of the session. Real working time is invisible here; only the exposure *after* a commit exists is measured.
- **Replayed from the branch start, 3 of 58 pull requests that edit `research/README.md` or `research/_homepage/projects.json` (5.2%, 95% Wilson 1.8% to 14.1%) conflict textually**, against 2 of 58 from pull-request creation (`swe-prlifetime`). 13 of 58 (22%) saw at least one other shared-file merge land after their first commit, against 12 (21%). Each pull request is one trial.
- **`research/PROJECTS.md` collides more than the two files everyone watches.** 44 of 122 pull requests edit it, and 5 of those 44 (11.4%, 95% Wilson 5.0% to 24.0%) conflict in it under the same replay; it is the track's progress log, so many runs append to the same paragraphs. It was not in `swe-sharedfiles`'s or `swe-prlifetime`'s list of shared files. Across all 122 pull requests, 10 (8.2%, Wilson 4.5% to 14.4%) conflict anywhere; the others were one in `prompts/experiments.md`, and one that carried regenerated `gitops/prod/front-door/` files and `platform/pages/` code into a `research/` merge.
- **Read together:** counting `PROJECTS.md`, the shared-file conflict exposure is roughly twice what the index files alone suggest, but still small in absolute terms, and the earlier conclusion (it does not on its own justify a generated index) stands. If any file is worth restructuring it is `PROJECTS.md`, for example a per-track progress file instead of one shared one; that is a proposal for `prompt.md`'s experiment process, not something this project adopts.

## Reproduce
```bash
git fetch --unshallow origin main    # full history is needed
cd research/swe-branchlife
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 6 tests, about a second
python3 experiments/run.py > experiments/results.txt       # about a minute
```
`data/branches.csv` holds `number, first_commit, n_commits, truncated` for each merged pull request in `swe-prlifetime/data/prs.csv`, from the GitHub API's pull-request commits endpoint (`experiments/fetch.py`, run 2026-10-17; 338 pull requests, of which the 122 in the window are used). `first_commit` is the earlier of the first commit's author and committer date. Only timestamps and counts are stored, no names, e-mails or messages. The window and the join are `swe-prlifetime`'s (coverage from 2026-10-16T11:20:31Z).

## Motivation
`swe-prlifetime` measured pull-request lifetime and said it was a lower bound on how long work is exposed to collisions, because a branch exists before its pull request. The API records every commit's date, so the branch start can be read directly.

## Builds on
`swe-prlifetime` (its data, its git helpers and its replay, imported from `../swe-prlifetime/src`), `swe-sharedfiles` and `swe-cleanbroken`. No lab's work is built on, and no lab is affiliated with or endorses this project.

## Method
`src/swe_branchlife/analyse.py`. Each merged pull request in the window is joined to its commit times. Branch lifetime is `merged_at - first_commit`. One first commit was dated after its pull request was opened (a clock or rewrite artefact), and its start is moved back to the creation time. Landings count other shared-file merges between the start and the pull request's own merge. The replay is `swe-prlifetime`'s: take `main` as of the start, apply the merge commit's own diff onto it, and three-way merge that with `main` just before the real merge (`git merge-tree`). Tests cover the parsing, the clamp, the half-open landing window, and a throwaway-repository replay that conflicts from an early base and is clean from a late one.

## Limitations
- **Commit time is not session start.** A session that works for an hour and commits once looks like a branch of zero minutes. The true exposure is longer than any figure here, by an amount this data cannot give. Session start times live in run records (`prompts/runs/`) and could be joined in a later project.
- One repository, about 1.5 days, 122 pull requests, 58 touching the two index files, 44 touching `PROJECTS.md`; the intervals are wide and the 5 of 44 and 3 of 58 differences are not distinguishable from noise.
- Textual conflicts only; `swe-cleanbroken` covers clean-but-wrong merges. The replay applies the squash diff as it was merged (agents merge `main` in before landing, which this deliberately undoes).
- Merged pull requests only; times are GitHub's and the committer's clock, in UTC.

## Next steps
Join session start times from `prompts/runs/` to measure working time against commit time; track `PROJECTS.md` conflicts as more history accrues; and test a per-track progress file against the single shared one in `swe-schedule`'s simulation.

## Owner steps
None.

## Outside dependencies
`git` 2.38 or later; this repository's history; GitHub's API for the timestamps in `data/branches.csv`, fetched once and committed.
