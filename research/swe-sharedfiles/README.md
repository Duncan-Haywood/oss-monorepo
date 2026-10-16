# How often do research merges collide on the shared index files, measured from git history?

Pure Python standard library plus `git` 2.38 or later. A measured follow-up to `swe-schedule`, whose next steps asked for README and `projects.json` merge conflicts to be modelled; this measures them instead, from this repository's own history. Part of milestone 5 of track 10 (the software-engineering loop). Produced with AI assistance (Claude). **Preliminary: one 3-day window, merge times only, and a replay that is an approximation.** All numbers are from `experiments/results.txt`.

- **Two files sit in most research merges.** Of 101 first-parent commits touching `research/` on `main` from 2026-10-14 to 2026-10-16, 65 (64.4%) edit both `research/README.md` and `research/_homepage/projects.json` (the shares are equal, as every project edits both).
- **They land close together.** The median gap between consecutive such merges is 30.6 min; 23% are under 10 min apart and 50% under 30 min.
- **So a pull request open for a while finds the files moved.** Share of shared-file merges with another one landing in the window before them: 13.8% at 5 min, 23.1% at 10, 36.9% at 20, 49.2% at 30, 73.8% at 60, 93.8% at 120.
- **Moved does not mean conflicted.** Replaying each later merge as if its branch had left from just before an earlier merge, then merging with git's three-way merge, gave a textual conflict in 1 of 17 pairs landing within 10 min (5.9%), 11 of 59 within 30 min (18.6%; 9 in a shared file, 15.3%) and 37 of 120 within 60 min (30.8%; 27 in a shared file, 22.5%). Pairs overlap (one commit is in several pairs), so these are rates per pair, not independent samples, and no interval is given.
- Read together: a run whose pull request stays open 30 min and edits the index files has roughly a one-in-six chance, per earlier landing in that window, of a textual conflict, and about 0.9 such landings are expected. Merging `main` in and rerunning `build.py` (which `research/CLAUDE.md` already prescribes) is the cost; this puts a size on it.

## Reproduce
```bash
git fetch --unshallow origin main    # full history is needed
cd research/swe-sharedfiles
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests, under a second
python3 experiments/run.py > experiments/results.txt       # about 10 seconds
```

## Motivation
`PROJECTS.md` track 10 lists merge conflicts on `README.md` and `projects.json` among the costs of four runs starting together. `research/CLAUDE.md` makes every project edit both. Whether that is a real cost, and how large, decides whether a generator or a claim protocol is worth building (a practice `swe-orgs` P27 flags as untested here).

## Builds on
`swe-schedule` (this repository) for the framing; `swe-orgs` P27 (Google's large-scale changes) for the idea of tooling that rewrites shared files. No lab's work is built on, and no lab is affiliated with or endorses this project.

## Method
`src/swe_sharedfiles/analyse.py`. `git log --first-parent` on `origin/main` lists each merged pull request as one commit with its time and files. Exposure is the share of shared-file merges preceded, within a window, by another. The replay takes an earlier commit *a* and a later commit *b*: it applies *b*'s own diff onto *a*'s parent (what *b*'s branch would have been had it left before *a*), then three-way merges the result with *a* using `git merge-tree`. Conflict paths are read from git's output. Tests cover the time arithmetic, half-open windows, and the replay on a throwaway repository with one clean and one conflicting pair.

## Limitations
- **Merge time is not branch time.** Squash merges hide when a branch was cut, so the windows are assumed pull-request lifetimes (5 to 240 min), not measured ones. The replay assumes the branch left right before *a*.
- Only pairs where both commits touch a shared file are replayed; a conflict can be in other files too, as the "anywhere" column shows.
- Textual conflicts only. A clean merge can still be wrong (a duplicated bullet, a broken JSON), and nothing here runs `build.py` on the result.
- Three days, 101 merges, one repository state of activity that is unusually high; the rate is not a forecast. Overlapping pairs mean the percentages carry more uncertainty than their size suggests.
- Some commits in the window are bulk edits (figures for several projects at once), which touch the same files by design.

## Next steps
Measure real pull-request lifetimes (one API call each) to replace the assumed windows, run `build.py` on merged replays to catch clean-but-wrong results, and test whether a generated index (so projects stop editing the shared files) removes the conflicts, through the experiment process in `prompt.md`.

## Owner steps
None.

## Outside dependencies
`git` 2.38 or later (for `merge-tree --write-tree`); this repository's history.

MIT.
