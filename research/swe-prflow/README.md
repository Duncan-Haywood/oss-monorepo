# What do 526 closed pull requests say about how the agent loop lands work?

Pure Python, no dependencies. Third, partial step of milestone 1 (`swe-ledger`) of track 10, the software-engineering loop. `swe-ledger` showed the run log holds no outcome data and `swe-backfill` read git history; this project adds the pull-request half: for every closed PR in this repository (#1 to #526, 2026-09-28 to 2026-10-15) it records when it was opened and when, if ever, it merged. **It has no CI results, review comments, authorship, or reasons for closing, and it does not compute the track metric.** Those fields were not returned by the GitHub list endpoint used (the commit count, line counts and comment count came back empty). All numbers below come from `experiments/results.txt`, computed from the committed `experiments/prs.txt`.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/swe-prflow/

- **87.5% of closed PRs merged** (460 of 526, Wilson 95% interval 84.3% to 90.0%); 66 were closed unmerged. All were closed by 2026-10-15 07:16 UTC, since no PR was open at the snapshot.
- **The merge rate fell in the tracked era.** PRs opened 09-28 to 10-01 merged 93.8% of the time (244/260); those opened from 10-05 on, 81.2% (216/266, intervals 90.2 to 96.2 and 76.1 to 85.4). The dip is concentrated on 10-14 (69 of 105, 66%). Why is not in this data. Closures could be duplicates, superseded work or mirror experiments.
- **Merges are fast.** Median creation-to-merge time is 0.6 minutes (p90 12.5), 0.3 minutes in the bulk era and 1.6 in the tracked era. Eighteen merged PRs waited more than 3 hours (maximum 36 hours).
- **Some merges happen in batches.** 20 merged PRs (4.3%) share one of four merge timestamps to the second (for example seven PRs at 09-30 20:19:25, after waits of up to 8 hours, and seven at 21:21:07 after 14 to 20 hours). That looks like blocked PRs being released together, which is the kind of queueing `swe-schedule` should model. The cause is not recorded.
- **Parallel starts lose more work.** 75 PRs were opened within 10 seconds of the previous PR (32 bursts, the biggest of size 5). Only 60.0% of them merged (45/75, Wilson 48.7% to 70.3%), against 92.0% of the other 451 (415, 89.1% to 94.2%). This association is large, but PRs that open together may differ in kind (mirror or bulk experiments, for example), so it does not show that parallelism causes unmerged work. It is the figure `swe-schedule` should test with a controlled trial.

```bash
cd research/swe-prflow
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 6 tests, under a second
python3 experiments/run.py                                # under a second; output in experiments/results.txt
```

## Motivation

Track 10's throughput term counts projects that merged, so the PR outcome is the denominator of every rate. Knowing how often PRs fail to merge, how long they wait and whether simultaneous starts hurt tells the allocation and scheduling milestones where to look.

## Builds on

`swe-ledger` and `swe-backfill` (this repository), and Wilson (1927), "Probable inference, the law of succession, and statistical inference", *JASA* 22(158), for the interval. Little (1961) on queueing is the framing for the batch-merge observation, which this project describes but does not model. No lab's work is built on, and no lab is affiliated with or endorses this project.

## Method

`experiments/prs.txt` lists, in PR-number order, the creation time and merge time (or `-`) of each closed PR as returned by the GitHub list-pull-requests API on 2026-10-15, retyped from the API response by the session agent. Line order gives the PR number, and the line count (526) matches the highest PR number. `src/swe_prflow/prflow.py` computes the rates, Wilson intervals, latency quantiles, shared-timestamp batches and bursts (a run of PRs each created within 10 seconds of the one before). Tests use hand-made rows.

## Limitations

- Timestamps were transcribed by hand from API output; a spot check against GitHub is advised. The count check catches dropped lines, not mistyped digits.
- PRs are not matched to runs, tracks, prompt versions or models, and closure reasons are unknown, so "unmerged" is not "failed".
- Burst membership uses a 10-second threshold chosen after looking at the data; other thresholds were not tried, and the comparison is observational.
- Mirror and other non-research PRs are included.

## Next steps

Fetch per-PR check runs and review comments for the 526 PRs (needs one call each), classify closure reasons, join PRs to `Claude-Session` trailers and run-log lines, and then compute the track metric with intervals per prompt version and model.

## Owner steps

None.

## Outside dependencies

The GitHub API for the PR timestamps. Produced with AI assistance (Claude). No language-model proposer was used.

MIT.
