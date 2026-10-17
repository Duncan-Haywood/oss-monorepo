# Process track, prompt 0

The master prompt (`prompt.md`) routes about 5% of runs here (the `process`
weight in `prompts/routing.json`). This run builds nothing new. It studies
**how software gets built in this repository** — the quality of what lands,
the errors along the way, and where sessions lose time — and writes up an
analysis with recommendations. The goals and guardrails in
[`prompts/goals.md`](../goals.md) are the target and the limit.

How this differs from the review track: the review track tunes the prompts
and documentation from the run records (`prompts/runs/`). This track looks at
the engineering process itself, from git history, pull requests and CI:
defects that reached `main`, red CI, rework, duplicate work, leaked branches,
and tests and checks that do or do not catch things. Use the run records as
one input, not the only one.

One study, one pull request, titled `process: study YYYY-MM-DD`. Open it as a
draft within your first few minutes. If an open pull request with that title
prefix exists, another run has claimed the study: route again with
`--track ventures` or `--track research` instead.

## 1. Pick the window

Start where the last report in [`reports/`](reports/) stopped; the first
study takes the last 14 days. Keep the window to at most 14 days, so the
study fits in one session.

## 2. Gather evidence

Measure; do not recall. Every number in the report names the command, query
or file it came from, so the next study can re-take it. Suggested sources
(use what answers a question; skip what does not):

- **Throughput and rework.** PRs merged and closed unmerged in the window;
  commits that revert or fix a commit from the window
  (`git log --since=... --grep='revert\|fix'`, then read them); follow-up PRs
  that exist only to repair an earlier one.
- **Errors reaching `main`.** `python3 platform/ci/run_workflow_locally.py
  --tree` on `main`; red runs on `main` in the window and what turned them
  green. Classify starved runs with `platform/ci/ci_starvation.py` first —
  a starved run is not a failure.
- **CI on PRs.** Failures before green per PR; which checks fail most; which
  failures were real defects and which were environment.
- **Duplicate and leaked work.** Pairs of PRs doing the same thing;
  `python3 platform/ci/unlanded_work.py`; branches with no PR.
- **Run records.** `python3 prompts/promptctl.py measure`: errors, integrity
  issues and doc friction, grouped by cause.
- **Guards.** Checks that fired and caught a real defect, checks that never
  fire, and defects that no check caught. `platform/ci/guard_state.py` shows
  what silently skips.

## 3. Audit a sample

Pick about five PRs merged in the window, at random, across `ventures/`,
`research/` and `platform/`. For each: re-run its tests, read the diff for
bugs, and check it against its definition of done (`PRODUCT_PLAYBOOK.md` for
a venture; a complete README and passing tests for research). Note what you
found and what would have caught it earlier.

## 4. Analyse

Group the problems by root cause, not by symptom, and count each group. For
the three largest, say why the current process lets them through. Say where
the evidence is thin; "too few cases to tell" is a valid finding, and
"never measured" is not zero.

## 5. Recommend

Rank recommendations by expected effect over cost. Each one gives: the
problem and its count, the change, which file or tool it touches, the metric
it should move, and who can make it (an agent, or the owner). Prefer a check
that fails over a sentence asking people to be careful, and deleting a stale
rule over adding a new one.

You may implement **one** recommendation in the same pull request if it is
small, low-risk and agent-owned (a check, a test, a fix to a tool or a stale
doc line). Leave the rest as recommendations. A recommendation that would
change `prompts/goals.md` goes under "Proposals for the owner" in
[`prompts/experiments.md`](../experiments.md), never into `goals.md` itself.

## 6. Follow up

Read the previous report's recommendations. For each: adopted or not, and,
if adopted, did its metric move? Say so in this report.

## 7. Write it up and land it

Write `prompts/process/reports/YYYY-MM-DD.md` with these sections: Window,
Evidence (with commands), Sample audit, Findings by root cause,
Recommendations (ranked), Follow-up on the last report. Keep it under about
300 lines; a table beats a paragraph.

Run `python3 prompts/promptctl.py validate` and
`python3 -m unittest discover -s prompts`, record this run (track
`process`), and land the pull request like any other run
(`.github/prompts/land-your-work.md`).
