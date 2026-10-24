# swe-cleanbroken: when research merges collide cleanly, is the result still right?

Pure Python standard library plus `git` 2.38 or later. A follow-up to `swe-sharedfiles`, whose next steps asked whether textually clean merges of the shared index files are still wrong. Part of milestone 5 of track 10 (the software-engineering loop). Produced with AI assistance (Claude). **Preliminary: one 3-day window, and a replay that approximates real pull-request lifetimes.** All numbers are from `experiments/results.txt`.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/swe-cleanbroken/

- **No clean-but-broken merge turned up.** Of 129 pairs of index-file merges landing within 60 min of each other, 37 (28.7%) conflicted textually and the other 92 merged cleanly with no new breakage. Within 30 min: 64 pairs, 11 conflicts (17.2%), 53 clean, 0 broken. Within 10 min: 18 pairs, 1 conflict, 17 clean, 0 broken. "Broken" means the merged tree fails a check the homepage build enforces (below) that neither original commit failed. Pairs overlap, so this is not 92 independent trials; with zero events, a rough 95% upper bound on the rate is about 3% (3 / 92) if they were independent, and the real bound is looser.
- **So the cost of a collision is the conflict, not a silent error.** Of the failures `research/CLAUDE.md` guards against (a project missing from `projects.json` or `README.md`, a listed project that does not exist, a slug listed twice), none appeared in a replayed merge. A conflict is loud; a clean merge was safe in this sample.
- **A real inconsistency was found elsewhere, and fixed.** The same checker, run on each actual `main` commit, found two projects (`interleave-twin`, `multi-observation-elicitation`) with two bullets each in `research/README.md`, present since the repository fold-in commit (`6aad81af4`), not from concurrent merges. `build.py` did not notice because it collects bullets into a dictionary where the later one silently wins. This pull request removes the two stale duplicates and makes `build.py` fail on a project with more than one bullet.

## Reproduce
```bash
git fetch --unshallow origin main    # full history is needed
cd research/swe-cleanbroken
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 6 tests, a few seconds
python3 experiments/run.py > experiments/results.txt       # about a minute; ends at a pinned commit
python3 experiments/figure.py                               # redraws experiments/windows.svg from results.txt
```

## Motivation
`swe-sharedfiles` measured that a pull request open 30 min and editing the index files meets a textual conflict in about one case in six per earlier landing. It left open the worse case: a merge git accepts but that leaves the index inconsistent. That would cost a broken Pages build after the merge, not a visible conflict before it.

## Builds on
`swe-sharedfiles` (this repository): its commit selection and replay idea. The rules checked are those of `research/_homepage/build.py` `validate()`. No lab's work is built on, and no lab is affiliated with or endorses this project.

## Method
`src/swe_cleanbroken/check.py`. For an earlier merge *a* and a later merge *b* within a window, *b*'s diff is re-applied to *a*'s parent, then merged with *a* using `git merge-tree --write-tree`. If git reports a conflict the pair is "conflict". Otherwise the merged tree is read straight from git (no checkout) and checked: `projects.json` parses; every `research/` project directory not starting with `_` or `.` is listed once there and has exactly one `README.md` bullet; no listed or bulleted project is missing a directory; every `featured` slug is listed. Errors already present in *a*'s or *b*'s own tree are not charged to the merge. The same checks run on each original `main` commit to find existing inconsistencies. Tests build throwaway repositories with one conflicting pair, one clean pair, one pair where a clean merge is broken (one side deletes a project the other extends), and a pre-existing error that must not be blamed on the merge.

## Limitations
- **Few opportunities.** Three days, 67 index-touching commits, and most pairs that do not conflict touch different parts of the files. A rarer failure may need a larger sample.
- The replay assumes *b*'s branch left just before *a*; real branches also merge `main` in, which this does not model.
- It checks the consistency rules, not the whole build: it does not run `build.py` on the merged tree, so a failure the rules do not express (for example, malformed HTML in a summary) would not be seen.
- Rules are re-implemented on a git tree, not shared with `build.py`; if `build.py` gains a check, this must be updated.

## Next steps
Run `build.py` itself on each clean replay in a scratch checkout; widen the window to the full history; and measure real pull-request lifetimes (one API call each) to replace the assumed windows.

## Owner steps
None.

## Outside dependencies
`git` 2.38 or later (for `merge-tree --write-tree`); this repository's history.

MIT.
