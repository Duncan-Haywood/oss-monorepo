# What does git history say about the agent loop that the run log cannot?

Pure Python, no dependencies. Second step of milestone 1 (`swe-ledger`) of track 10, the software-engineering loop. `swe-ledger` found that the run log holds no cost fields and lists only 184 of about 400 projects, and named backfilling from git as the next step. This project does the git half: it extracts every commit that touches `research/<slug>/` from the full history in `oss-monorepo` (517 commits, 396 projects, 2026-09-28 to 2026-10-15), commits that extract as `experiments/commits.jsonl`, and counts what it shows. **It does not backfill tokens, cost or wall time (git does not hold them), pull request data or CI results, and it does not compute the track metric.** All numbers below come from `experiments/results.txt`.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/swe-backfill/

- **The log's blind spot is a time window, not a track.** 239 projects were created before 2026-10-13 and 157 on or after. All 157 later ones are in the run log (100%). Of the 239 earlier ones, 22 are listed and 217 are not, and none of the 239 has a track prefix. So `swe-ledger`'s "roughly 215 projects the log never lists" are the bulk output of 2026-09-29 and 09-30 (89 and 129 projects created), before the log existed. Five slugs in the log are not in the history used here; four are newer upstream projects than the mirrored history (`accel-dataflow`, `osrobot-*`) and one (`project-pages`) is a milestone label.
- **Output is bursty.** Projects created per UTC day: 89 and 129 on 09-29/09-30, then none from 10-02 to 10-12 (no commits at all in that window in this history), then 93 and 61 on 10-13/10-14. The median gap between consecutive creations is 4 minutes, and 275 of 395 gaps are 10 minutes or less, so creation is dominated by parallel runs. Whether the quiet window is a real pause or a gap in how history was assembled is not decided by this data.
- **Follow-up families are about half of the full output, not a third.** With `swe-ledger`'s grouping rule over all 396 projects, 196 (49%) sit in a family of three or more. 108 of these are the pre-track `*-twin` projects, grouped by last word (a loose rule), so the tracked-era share is the better figure; `swe-ledger` measured it at 33%. Neighbouring members of one family were created within 3 hours of each other 152 times, which is the shape a duplicate-claim problem would also produce, but it is equally what a deliberate series looks like. This data cannot tell them apart.
- **Few projects are corrected in-tree soon after creation, as far as commit messages say.** Of the 234 projects with a full 14-day window, 6 (2.6%, 95% Wilson 1% to 5%) have a later commit whose subject contains a correction word (fix, correct, revert, repair, wrong, bug, mismatch, stale, erratum). Family members and other projects look alike (4/196 and 4/200). 76% of projects were never touched again in 14 days. **This is a lower bound on defects, not an estimate of them:** a defect nobody found, one fixed in a commit with a different subject, and one fixed in a shared file (`README.md`, `projects.json`) all escape it. `swe-audit` has to measure the real rate by re-running a sample.
- **Fully observed is hard here.** The history spans 17 days, so the 14-day window is complete only for projects created by 10-01, which are all pre-track bulk projects. The rate above says nothing about the tracked era and should not be read as a prompt-version or model comparison.

```bash
cd research/swe-backfill
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, under a second
python3 experiments/run.py                                # under a second; output in experiments/results.txt
# To regenerate the extract (needs a full-history clone of oss-monorepo; not run in CI):
python3 experiments/extract.py <path-to-clone> origin/main experiments/commits.jsonl
```

## Motivation

Track 10's metric is valuable, correct projects per unit of budget. Cost needs session metadata, but output and a first correctness signal can be read from git today. Knowing which era and which share of output the run log covers says how far any log-based number can be trusted.

## Builds on

`swe-ledger` (this repository): its families rule, Wilson interval and run-log snapshot (read from `../swe-ledger/experiments/runs_snapshot.jsonl` when present). Forsgren, Humble and Kim (2018), *Accelerate*, on measuring delivery by throughput and stability together; Wilson (1927), *JASA* 22(158), for the score interval. No lab's work is built on, and no lab is affiliated with or endorses this project.

## Method

`experiments/extract.py` runs `git log --no-merges --name-status -- research` and keeps, per commit, the abbreviated hash, author time in UTC, subject and per slug the files added, modified and deleted (and test files added). No names or emails are kept. `src/swe_backfill/backfill.py` treats the first commit that adds a file under a slug as its creation. Tests use hand-made commit lists and check creation, per-day counts, the 14-day window and its end-of-history censoring, the correction regex, family grouping, close-pair detection and the run-log comparison.

## Limitations

Authorship time is not merge time, and squash or mirror history may shift it. The history here starts 2026-09-28 and has the gap described above. Commits that touch only shared files (`research/README.md`, `site/projects.json`) are invisible to the per-slug counts, and those files are exactly where parallel runs collide, so merge-conflict cost (milestone `swe-schedule`) is not measured. Correction words in commit subjects are a weak signal. Track is read from the slug prefix. Pull requests, CI and tokens are not in this extract.

## Next steps

Join pull requests and CI check runs by commit to get time to merge and CI failures before green, which would replace the run log's all-zero CI field. Re-extract once the quiet window is understood. Hand a random sample of the 157 tracked-era projects to `swe-audit`.

## Owner steps

Read `/usage` for plan token totals (git cannot supply them).

## Outside dependencies

Git history of `oss-monorepo`, extracted once. Produced with AI assistance (Claude). No language-model proposer was used.

MIT.
