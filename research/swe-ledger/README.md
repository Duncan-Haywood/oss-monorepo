# What can the run log measure about the agent loop today?

Pure Python, no dependencies. First, partial step of milestone 1 (`swe-ledger`) of track 10, the software-engineering loop. The track's metric is valuable, correct projects per unit of compute budget. Before any such metric can be computed, the log has to hold the inputs. This project reads a committed snapshot of `prompts/runs.jsonl` (189 runs, 2026-10-01 to 2026-10-15) and reports what is recorded, what is missing, and which throughput proxies the log does support. **It does not backfill the log from git history, pull requests or CI, and it does not compute the track metric.** That remains the open part of the milestone. All numbers below come from `experiments/results.txt`.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/swe-ledger/

- **Cost cannot be measured yet.** `tokens_in`, `tokens_out`, `cost_usd`, `usage` and `merged` are present in 1% of runs (one or two records), `tool_calls` in none, `wall_minutes` in 3%. Start and end times give a wall time for only 15 runs (median 20 minutes). Any per-token or per-subscription-week figure would rest on at most a handful of runs, so none is reported.
- **Output can be counted by proxy.** The 189 runs list 184 distinct project slugs. By slug prefix, `robofab` (32), `garment` (30), `simdesign` (29) and `selfrep` (25) lead; `eda`, `osrobot` and `accel` have 1 to 3 each, and tracks 10 and 11 had none at the snapshot. Tests added by single-track runs are listed beside the counts. 23 slugs belong to no track prefix (mostly the `*-twin` projects from before the tracks).
- **Follow-ups are a large share.** 33% of listed projects sit in one of nine name-stem families with at least three members (for example `garment-twon*`, 10; `simdesign-gaug*`, 8; `chip-syst*`, 8). Whether a follow-up is worth less per token than a new milestone is the question `swe-value` asks; this count only says how much of the output is in question.
- **24 slugs appear in more than one run.** That is a re-touch (an `extend` run) or two runs claiming the same project; the log cannot tell which. It is the measurable face of the duplicate-work problem `swe-schedule` targets.
- **Self-reported fields look too clean to trust.** Every run with a recorded `ci_failures_before_green` (143 of 143) says 0, and 1 of 189 records an integrity issue, while 82 of 189 (43%, 95% Wilson interval 37% to 51%) record an error. Zero failures in 143 reports is what a field only filled in on success would show. It is not evidence that CI never failed. `swe-audit` must check these against CI history.

```bash
cd research/swe-ledger
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, under a second
python3 experiments/run.py                                # under a second; output in experiments/results.txt
```

## Motivation

Track 10 asks which brief, task mix, model and schedule give the most valuable correct work per subscription-week. An allocation or bandit model needs per-run cost and value; if the log lacks them, the first result is what to start recording. This project turns that into a counted list instead of an impression, and gives later milestones an interval-aware summariser to reuse.

## Builds on

Forsgren, Humble and Kim (2018), *Accelerate*, for measuring throughput and stability together; Wilson (1927), "Probable inference, the law of succession, and statistical inference", *JASA* 22(158), for the score interval used on every rate. No lab's work is built on, and no lab is affiliated with or endorses this project.

## Method

`src/swe_ledger/ledger.py`. Coverage is the share of runs whose field is not null. Track is the slug's first word, if it is one of the eleven track prefixes. A family is the shortest name stem (at least four characters after the prefix) shared by at least three slugs of one track, so stems are truncated (`garment-twon`) and one slug can join only the family its shortest stem finds; slugs with no track prefix are grouped by last word (`*-twin`). Tests check the Wilson interval against a known value and its bounds, null handling, the time parser, collision detection, per-track counting and family grouping.

## Limitations

The snapshot is the run log, not the repository: `research/` held about 400 projects when it was taken, against 184 listed here, so the log under-counts output, and the counts say nothing about the other ~200. The log is self-reported by the sessions it describes. Track by slug prefix is a heuristic. The family grouping is a coarse name match and will merge unrelated slugs that share a stem. No value or correctness is scored, so no ranking of tracks or models follows from these counts. One model (`claude-sonnet-5-5`) wrote 182 of the 189 records, so a model comparison is not possible.

## Next steps

Backfill the log from full git history, pull requests and CI check runs (this clone is shallow), starting with the roughly 215 projects the log never lists. Add the fields the coverage table shows empty to the record template so new runs fill them. Then compute the track metric per prompt version, model and track with intervals, and hand the audit sample to `swe-audit`.

## Owner steps

Read `/usage` for the plan and give the session the weekly token totals; the sandbox cannot see them.

## Outside dependencies

None (standard library only). Produced with AI assistance (Claude). No language-model proposer was used.

MIT.
