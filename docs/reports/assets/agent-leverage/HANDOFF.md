# Handoff: finish the human-time study

**Status (2026-10-20):** started, not finished. The owner asked for a defensible
"human-equivalent hours per dollar" figure. The report
[`../../2026-10-20-agent-leverage-and-manager-agents.md`](../../2026-10-20-agent-leverage-and-manager-agents.md)
uses the runs' own estimates, which `runcost.py` labels low certainty. This
study replaces them with independent estimates on a fixed sample.

## What is done

- `sample.json`: 40 merged PRs on `Duncan-Haywood/oss-monorepo`, drawn by
  `sample.py draw` (seed 20261020) from the 1,074 merged PRs in
  `prompts/derived/runs.json`, stratified by track: research 14, ventures 10,
  process, redteam, explore and review 4 each. Each row carries the run's own
  estimate (`self_h`, present for 26 of 40; median 1.75 h), active minutes,
  API-equivalent cost, model and PR size.
- `sample.py packs OUT_DIR` writes one blind pack per PR (message, stat, diff
  truncated at 30,000 chars, run records excluded, no self-estimate). It was
  checked to reproduce the same 40 packs twice.

## What is left

1. **Build the packs** in your scratchpad: `python3 docs/reports/assets/agent-leverage/sample.py packs <scratch>/packs`.
2. **Estimate blind, twice.** Give two independent estimators (two fresh
   subagents, or better one subagent and one human) the packs only, never
   `sample.json`, with this brief: "For each PR, estimate the hours a competent
   mid-to-senior engineer new to this repository would need to produce the same
   change to the same quality, including reading context, writing, testing and
   opening the PR. Give low, likely and high hours and one line of reasoning.
   Count generated or copied content (data files, boilerplate) at the time it
   would take to generate or copy it, not to type it." Ask for JSON:
   `{"pr": N, "low": h, "likely": h, "high": h, "why": "..."}`.
3. **Record and compare** in a new `estimates.json` here: per-PR estimates from
   both estimators, their agreement (median ratio and the share within 2x of
   each other) and their ratio to `self_h`. Two estimators built on the same
   model share its biases, so say so; one human estimate on even 10 PRs is
   worth more than a third model.
4. **Compute the headline** as follows. Human-equivalent hours per merged PR =
   the median of the estimators' `likely`, weighted by track share among
   merged PRs (research ~45%, ventures ~30%, process ~10%, redteam ~8%, explore
   ~6%, review ~4% in `derived/runs.json`; recompute these). Multiply by merged
   PRs per month (search `is:merged merged:<30-day range>`; 3,264 for
   2026-09-20..10-19) and divide by the owner's reported $800 a month. Report a
   range from the low and high estimates, not one number.
5. **Check for survival.** Once each sampled PR is 14 days old, run
   `python3 prompts/derive.py fetch && python3 prompts/derive.py build` and
   discount PRs whose lines did not survive. Work that was rewritten a week
   later did not save anyone those hours.
6. **Update the report's "Leverage" table and the post** with the measured
   figures, and keep the self-estimate row for comparison. Delete this handoff's
   "What is left" list once it is done.

## Pitfalls

- Do not show estimators `self_h`, or the run record, or the PR body's claims
  about effort. That would anchor them.
- Truncated diffs (marked) understate size; estimators should use the stat.
- Research PRs often carry experiment output; time to run an experiment is
  machine time, not engineer time, unless a person would have had to babysit it.
